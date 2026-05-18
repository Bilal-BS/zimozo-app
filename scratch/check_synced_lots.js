import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';

const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const dbPath = path.join(appData, 'zimozo-windows-app', 'zimozo_offline.db');

const db = new sqlite3.Database(dbPath);

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
    const lotProducts = await dbAll(`
      SELECT DISTINCT p.remote_id, p.name, p.sku, p.enable_sr_no, p.enable_expiry
      FROM products p
      JOIN product_lots pl ON p.remote_id = pl.remote_product_id
      WHERE pl.lot_number IS NOT NULL OR pl.expiry_date IS NOT NULL
    `);
    
    console.log(`Found ${lotProducts.length} products with synced lots/expiries:`);
    console.log(JSON.stringify(lotProducts.slice(0, 15), null, 2));

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
