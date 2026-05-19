import axios from 'axios';
import { db } from './db';
import { Capacitor } from '@capacitor/core';

// ─────────────────────────────────────────────────────────────
// Config helpers — works on BOTH Electron (window.electronAPI)
// AND Android/Capacitor (localStorage fallback)
// ─────────────────────────────────────────────────────────────
const electronAPI = (window as any).electronAPI;

const getApiConfig = async (): Promise<any> => {
  try {
    if (electronAPI?.getSettings) {
      const s = await electronAPI.getSettings();
      if (s && s.baseUrl) return s;
    }
  } catch (_) {}
  // Capacitor / web fallback → localStorage
  try {
    const local = localStorage.getItem('zimozo_api_config');
    if (local) return JSON.parse(local);
  } catch (_) {}
  return { baseUrl: '', accessToken: '' };
};

const saveApiConfig = async (config: any): Promise<void> => {
  try {
    localStorage.setItem('zimozo_api_config', JSON.stringify(config));
  } catch (_) {}
  try {
    if (electronAPI?.saveSettings) await electronAPI.saveSettings(config);
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────
// Axios client — headers injected per-request so they are
// always fresh (fixes Android "token not found" after login)
// ─────────────────────────────────────────────────────────────
const apiClient = axios.create({ timeout: 30000 });

apiClient.interceptors.request.use(async (config) => {
  const apiConfig = await getApiConfig();
  if (apiConfig?.baseUrl) {
    let url = String(apiConfig.baseUrl).trim();
    if (url && !url.startsWith('http')) url = 'https://' + url;
    config.baseURL = url.endsWith('/') ? url.slice(0, -1) : url;
  }
  if (apiConfig?.accessToken) {
    config.headers.Authorization = `Bearer ${apiConfig.accessToken}`;
  }
  config.headers.Accept = 'application/json';
  config.headers['Content-Type'] = 'application/json';
  return config;
});

// ─────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────
async function dbAll(query: string, params: any[] = []) {
  return await db.query(query, params);
}
async function dbRun(query: string, params: any[] = []) {
  return await db.execute(query, params);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export async function initSyncService() {
  console.log('🚀 Sync Service Initialized. Platform:', Capacitor.getPlatform());
}

export async function syncNow() {
  await syncLoop();
}

// ─────────────────────────────────────────────────────────────
// Upload pending local records → Cloud ERP
// ─────────────────────────────────────────────────────────────
async function uploadPendingRecords() {
  try {
    const pending = await dbAll(`
      SELECT * FROM sync_queue
      WHERE status = 'pending'
      OR (status = 'failed' AND retry_count < 3)
      LIMIT 20
    `);
    if (pending.length === 0) return;
    console.log(`⬆️  ${pending.length} pending records to upload.`);

    for (const item of pending) {
      try {
        let endpoint = '';
        let payload: any = {};

        try {
          payload = JSON.parse(item.payload || '{}');
        } catch {
          await dbRun('UPDATE sync_queue SET status = ?, error_log = ? WHERE id = ?',
            ['failed', 'Malformed JSON payload', item.id]);
          continue;
        }

        switch (item.table_name) {
          case 'sales':
            if (item.action === 'CREATE_RETURN') {
              endpoint = '/connector/api/sell-return';
              payload = {
                transaction_id: payload.transaction_id,
                products: payload.products.map((p: any) => ({
                  product_id: p.product_id,
                  variation_id: p.variation_id,
                  quantity: p.quantity,
                  unit_price: p.unit_price
                }))
              };
            } else {
              endpoint = '/connector/api/sell';
              payload = { sells: [payload] };
            }
            break;
          case 'customers':
            endpoint = '/connector/api/contactapi';
            payload = {
              type: 'customer',
              first_name: payload.name,
              mobile: payload.phone,
              email: payload.email,
              city: payload.address,
              address_line_1: payload.address
            };
            break;
          case 'expenses':
            endpoint = '/connector/api/expense';
            payload = {
              location_id: payload.location_id || 1,
              final_total: payload.amount,
              transaction_date: payload.date || new Date().toISOString().slice(0, 19).replace('T', ' '),
              additional_notes: payload.note,
              payments: [{ amount: payload.amount, method: 'cash' }]
            };
            break;
          default:
            console.log(`No endpoint mapped for table: ${item.table_name}`);
            continue;
        }

        const response = await apiClient.post(endpoint, payload);

        // Detect API-level error inside a 200 OK body
        let hasError = false;
        let apiErrorMsg = '';
        if (response.data) {
          if (response.data.error) {
            hasError = true;
            apiErrorMsg = typeof response.data.error === 'object'
              ? JSON.stringify(response.data.error)
              : response.data.error;
          } else if (Array.isArray(response.data)) {
            for (const r of response.data) {
              const e = r.error || r.original?.error;
              if (e) { hasError = true; apiErrorMsg = typeof e === 'object' ? JSON.stringify(e) : e; break; }
            }
          }
        }
        if (hasError) throw new Error(`API error: ${apiErrorMsg}`);

        if (response.data?.success || response.status === 200 || response.status === 201) {
          await dbRun('UPDATE sync_queue SET status = ?, error_log = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['synced', item.id]);

          let remoteId = response.data?.data?.id
            || (Array.isArray(response.data?.data) ? response.data.data[0]?.id : null)
            || (Array.isArray(response.data) ? response.data[0]?.id : null)
            || response.data?.id;

          try {
            if (remoteId) {
              await dbRun(`UPDATE ${item.table_name} SET remote_id = ?, sync_status = 'synced' WHERE id = ?`,
                [remoteId, item.record_id]);
            } else {
              await dbRun(`UPDATE ${item.table_name} SET sync_status = 'synced' WHERE id = ?`, [item.record_id]);
            }
          } catch (e: any) {
            console.error(`Error updating source table ${item.table_name}:`, e.message);
          }
        } else {
          throw new Error(`API returned failure: ${JSON.stringify(response.data)}`);
        }

      } catch (error: any) {
        const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        const code   = error.response?.status || 'N/A';
        console.error(`❌ Upload ${item.table_name} (${item.record_id}): HTTP ${code}`, detail);
        await dbRun(
          'UPDATE sync_queue SET status = ?, error_log = ?, retry_count = retry_count + 1 WHERE id = ?',
          ['failed', `HTTP ${code}: ${detail}`, item.id]
        );
        try { await dbRun(`UPDATE ${item.table_name} SET sync_status = 'failed' WHERE id = ?`, [item.record_id]); } catch (_) {}
      }
    }
  } catch (error: any) {
    console.error('Error in uploadPendingRecords:', error);
  }
}

// ─────────────────────────────────────────────────────────────
// Download fresh data from Cloud ERP → local SQLite
// ─────────────────────────────────────────────────────────────
async function downloadUpdates() {
  const config = await getApiConfig();
  console.log('📡 Fetching fresh data from Cloud ERP...');

  // 0. Business Settings + Payment Methods
  try {
    const bizRes = await apiClient.get('/connector/api/business-details');
    const bizData = bizRes.data?.data || bizRes.data;
    if (bizData) {
      config.businessDetails = bizData;
      try {
        const pmRes = await apiClient.get('/connector/api/payment-method');
        const pmList = pmRes.data?.data || pmRes.data || [];
        if (Array.isArray(pmList) && pmList.length > 0) {
          config.businessDetails.custom_payment_methods = pmList.map((pm: any) => ({
            id: pm.id,
            name: pm.name,
            method: pm.method_type || pm.name?.toLowerCase().replace(/\s+/g, '_')
          }));
        }
      } catch (_) {}
      await saveApiConfig(config);
      console.log('✅ Business settings + payment methods synced.');
    }
  } catch (e: any) { console.error('Failed to sync business details:', e.message); }

  // 0b. Logged-in user role & permissions
  try {
    const userRes = await apiClient.get('/connector/api/user/loggedinuser');
    const userData = userRes.data?.data || userRes.data;
    if (userData) {
      config.loggedInUser = {
        name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : userData.name,
        email: userData.email,
        role: userData.roles?.[0]?.name || userData.role_name || 'staff',
        permissions: userData.roles?.[0]?.permissions?.map((p: any) => p.name) || [],
        all_locations: userData.sales_commission_agent?.location_id || null,
        max_discount: userData.max_sales_discount_percent
          ? parseFloat(userData.max_sales_discount_percent) : null
      };
      await saveApiConfig(config);
      try {
        await dbRun(`
          INSERT OR REPLACE INTO users (remote_id, name, username, role, sync_status)
          VALUES (?, ?, ?, ?, 'synced')
        `, [userData.id, config.loggedInUser.name, userData.email, config.loggedInUser.role]);
      } catch (_) {}
      console.log(`✅ User role synced: ${config.loggedInUser.role}`);
    }
  } catch (e: any) { console.log('ℹ️ Could not sync user profile:', e.message); }

  // 1. Business Locations
  try {
    const locRes = await apiClient.get('/connector/api/business-location');
    const locations = locRes.data?.data || [];
    if (locations.length > 0) {
      await dbRun('DELETE FROM business_locations');
      for (const loc of locations) {
        await dbRun(`
          INSERT INTO business_locations (remote_id, name, city, state, country, settings_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [loc.id, loc.name, loc.city, loc.state, loc.country, JSON.stringify(loc)]);
      }
      console.log(`✅ ${locations.length} locations synced.`);
    }
  } catch (e: any) { console.error('Failed to sync locations:', e.message); }

  // 2. Tax Rates
  try {
    const taxRes = await apiClient.get('/connector/api/tax');
    const taxes = taxRes.data?.data || taxRes.data || [];
    if (taxes.length > 0) {
      await dbRun('DELETE FROM tax_rates');
      for (const tax of taxes) {
        await dbRun(`INSERT OR REPLACE INTO tax_rates (remote_id, name, amount) VALUES (?, ?, ?)`,
          [tax.id, tax.name, parseFloat(tax.amount || 0)]);
      }
    }
  } catch (e: any) { console.error('Failed to sync tax rates:', e.message); }

  // 3. Products + Lots
  try {
    const prodRes = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
    const products = prodRes.data?.data || [];
    if (products.length > 0) {
      await dbRun('DELETE FROM products');
      await dbRun('DELETE FROM product_lots');
      let lotsCount = 0;

      for (const prod of products) {
        let price = 0, variationId = 0;
        if (prod.product_variations?.[0]?.variations?.[0]) {
          price       = parseFloat(prod.product_variations[0].variations[0].sell_price_inc_tax || 0);
          variationId = prod.product_variations[0].variations[0].id;
        }

        let stock = prod.current_stock || 0;
        let locationStocks: Record<string, number> = {};
        if (prod.product_variations?.[0]?.variations?.[0]?.variation_location_details) {
          const lds = prod.product_variations[0].variations[0].variation_location_details;
          stock = lds.reduce((s: number, l: any) => s + parseFloat(l.qty_available || 0), 0);
          lds.forEach((ld: any) => { locationStocks[ld.location_id] = parseFloat(ld.qty_available || 0); });
        }

        // Parse full variations
        let parsedVariations: any[] = [];
        for (const pv of (prod.product_variations || [])) {
          for (const v of (pv.variations || [])) {
            if (v.name && v.name !== 'DUMMY') {
              const locStocks: Record<string, number> = {};
              (v.variation_location_details || []).forEach((ld: any) => {
                locStocks[ld.location_id] = parseFloat(ld.qty_available || 0);
              });
              parsedVariations.push({ id: v.id, name: v.name, price: parseFloat(v.sell_price_inc_tax || 0), sku: v.sub_sku, location_stocks: locStocks });
            }
          }
        }

        const assignedLocations = (prod.product_locations || []).map((l: any) => l.id);
        const enableExpiry = (prod.enable_expiry !== undefined ? prod.enable_expiry : (prod.expiry_period ? 1 : 0)) || 0;

        await dbRun(`
          INSERT OR REPLACE INTO products
            (remote_id, variation_id, name, sku, barcode, price, stock_quantity, category, category_id,
             image_url, type, variations_json, enable_expiry, enable_sr_no,
             location_stocks_json, assigned_locations_json, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
        `, [
          prod.id, variationId, prod.name, prod.sku, prod.barcode, price,
          stock, prod.category?.name || 'General', prod.category?.id || 0,
          prod.image_url || null, prod.type || 'single',
          parsedVariations.length > 0 ? JSON.stringify(parsedVariations) : null,
          enableExpiry, prod.enable_sr_no || 0,
          JSON.stringify(locationStocks), JSON.stringify(assignedLocations)
        ]);

        // Sync lots
        for (const pv of (prod.product_variations || [])) {
          for (const v of (pv.variations || [])) {
            for (const ld of (v.variation_location_details || [])) {
              for (const lot of (ld.lot_details || [])) {
                const lotNumber  = lot.lot_number || '-';
                const expiryDate = lot.exp_date || lot.expiry_date || lot.expiry || null;
                const qty        = parseFloat(lot.qty_available || lot.qty_remaining || 0);
                if (lotNumber || expiryDate) {
                  await dbRun(`
                    INSERT INTO product_lots (remote_product_id, lot_number, expiry_date, qty_remaining, location_id, sync_status)
                    VALUES (?, ?, ?, ?, ?, 'synced')
                  `, [prod.id, lotNumber, expiryDate, qty, ld.location_id || null]);
                  lotsCount++;
                }
              }
            }
          }
        }
      }
      console.log(`✅ ${products.length} products + ${lotsCount} lots synced.`);
    }
  } catch (e: any) { console.error('Failed to sync products:', e.message); }

  // 4. Customers
  try {
    const custRes = await apiClient.get('/connector/api/contactapi?type=customer');
    const customers = custRes.data?.data || [];
    if (customers.length > 0) {
      await dbRun('DELETE FROM customers');
      for (const c of customers) {
        await dbRun(`
          INSERT INTO customers (remote_id, name, phone, email, address, balance, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, 'synced')
        `, [c.id, c.name, c.mobile, c.email, c.city, parseFloat(c.balance || 0)]);
      }
      console.log(`✅ ${customers.length} customers synced.`);
    }
  } catch (e: any) { console.error('Failed to sync customers:', e.message); }

  // 5. Suppliers
  try {
    const supRes = await apiClient.get('/connector/api/contactapi?type=supplier');
    const suppliers = supRes.data?.data || [];
    if (suppliers.length > 0) {
      await dbRun('DELETE FROM suppliers');
      for (const s of suppliers) {
        await dbRun(`
          INSERT INTO suppliers (remote_id, name, phone, email, address, sync_status)
          VALUES (?, ?, ?, ?, ?, 'synced')
        `, [s.id, s.name, s.mobile, s.email, s.city]);
      }
      console.log(`✅ ${suppliers.length} suppliers synced.`);
    }
  } catch (e: any) { console.error('Failed to sync suppliers:', e.message); }
}

// ─────────────────────────────────────────────────────────────
// Main sync loop
// ─────────────────────────────────────────────────────────────
async function syncLoop() {
  const config = await getApiConfig();
  if (!config?.accessToken) {
    console.log('No access token — skipping sync.');
    return;
  }
  console.log('🔄 Starting sync cycle... Platform:', Capacitor.getPlatform());
  try {
    await uploadPendingRecords();
    await downloadUpdates();
    console.log('✨ Sync complete.');
  } catch (error: any) {
    console.error('❌ Sync cycle failed:', error.message);
  }
}
