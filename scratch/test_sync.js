import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';
import sqlite3 from 'sqlite3';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');
const dbPath = path.join(appData, 'zimozo-windows-app', 'zimozo_offline.db');

if (!fs.existsSync(configPath)) {
  console.error('Config file not found at:', configPath);
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const apiClient = axios.create({
  baseURL: config.baseUrl?.trim().endsWith('/') ? config.baseUrl.trim().slice(0, -1) : config.baseUrl.trim(),
  headers: {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  httpsAgent
});

const db = new sqlite3.Database(dbPath);

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  try {
    console.log('Connected to SQLite DB at:', dbPath);
    console.log('Fetching products with lot details from ERP...');
    
    const res = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
    const products = res.data?.data || [];
    console.log(`Fetched ${products.length} products. Syncing to local SQLite...`);
    
    await dbRun('DELETE FROM products');
    await dbRun('DELETE FROM product_lots');
    
    let lotCount = 0;
    
    for (const prod of products) {
      let price = 0;
      let variationId = 0;
      if (prod.product_variations?.[0]?.variations?.[0]) {
        price = parseFloat(prod.product_variations[0].variations[0].sell_price_inc_tax || 0);
        variationId = prod.product_variations[0].variations[0].id;
      }

      let stock = prod.current_stock || 0;
      let locationStocks = {};
      if (prod.product_variations?.[0]?.variations?.[0]?.variation_location_details) {
          const locDetails = prod.product_variations[0].variations[0].variation_location_details;
          stock = locDetails.reduce((sum, loc) => sum + parseFloat(loc.qty_available || 0), 0);
          locDetails.forEach(ld => {
              locationStocks[ld.location_id] = parseFloat(ld.qty_available || 0);
          });
      }
      const locationStocksJson = JSON.stringify(locationStocks);

      let parsedVariations = [];
      if (prod.product_variations && prod.product_variations.length > 0) {
        for (const pv of prod.product_variations) {
          if (pv.variations) {
            for (const v of pv.variations) {
              if (v.name && v.name !== 'DUMMY') {
                let locStocks = {};
                if (v.variation_location_details) {
                  v.variation_location_details.forEach(ld => {
                    locStocks[ld.location_id] = parseFloat(ld.qty_available || 0);
                  });
                }
                parsedVariations.push({
                  id: v.id,
                  name: v.name,
                  price: parseFloat(v.sell_price_inc_tax || 0),
                  sku: v.sub_sku,
                  location_stocks: locStocks
                });
              }
            }
          }
        }
      }
      const variationsJson = parsedVariations.length > 0 ? JSON.stringify(parsedVariations) : null;
      
      const enableExpiry = (prod.enable_expiry !== undefined ? prod.enable_expiry : (prod.expiry_period ? 1 : 0)) || 0;
      const enableSrNo = prod.enable_sr_no || 0;

      let assignedLocations = [];
      if (Array.isArray(prod.product_locations)) {
        assignedLocations = prod.product_locations.map(l => l.id);
      }
      const assignedLocationsJson = JSON.stringify(assignedLocations);

      await dbRun(`
        INSERT OR REPLACE INTO products (remote_id, variation_id, name, sku, barcode, price, stock_quantity, category, category_id, image_url, type, variations_json, enable_expiry, enable_sr_no, location_stocks_json, assigned_locations_json, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
      `, [
        prod.id, variationId, prod.name, prod.sku, prod.barcode, price, 
        stock, prod.category?.name || 'General', 
        prod.category?.id || 0, prod.image_url || null,
        prod.type || 'single', variationsJson, enableExpiry, enableSrNo, locationStocksJson, assignedLocationsJson
      ]);

      // Sync lot details
      if (prod.product_variations) {
        for (const pv of prod.product_variations) {
          if (pv.variations) {
            for (const v of pv.variations) {
              if (v.variation_location_details) {
                for (const ld of v.variation_location_details) {
                  if (ld.lot_details && Array.isArray(ld.lot_details)) {
                    for (const lot of ld.lot_details) {
                      const lotNumber = lot.lot_number || "-";
                      const expiryDate = lot.exp_date || lot.expiry_date || lot.expiry || null;
                      const qty = parseFloat(lot.qty_available || lot.qty_remaining || 0);

                      if (lotNumber || expiryDate) {
                        await dbRun(`
                          INSERT INTO product_lots (remote_product_id, lot_number, expiry_date, qty_remaining, location_id, sync_status)
                          VALUES (?, ?, ?, ?, ?, 'synced')
                        `, [
                          prod.id,
                          lotNumber,
                          expiryDate,
                          qty,
                          ld.location_id || null
                        ]);
                        lotCount++;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`\n🎉 Success! Synced ${products.length} products to offline SQLite DB.`);
    console.log(`🎉 Success! Synced ${lotCount} total lot/expiry entries.`);

    // Verify by listing a few product lots
    console.log('\n--- Synced Lot & Expiry Sample (From SQLite Table product_lots) ---');
    const samples = await dbAll('SELECT * FROM product_lots WHERE lot_number IS NOT NULL OR expiry_date IS NOT NULL LIMIT 10');
    console.table(samples);

    db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
