import axios from 'axios';
import { db } from './db';

const getApiConfig = () => {
  try {
    const local = localStorage.getItem('zimozo_api_config');
    if (local) return JSON.parse(local);
  } catch (e) {}
  return { baseUrl: '', accessToken: '' };
};

const saveApiConfig = (config: any) => {
  localStorage.setItem('zimozo_api_config', JSON.stringify(config));
};

const apiClient = axios.create({ timeout: 15000 });
apiClient.interceptors.request.use((config) => {
  const apiConfig = getApiConfig();
  if (apiConfig.baseUrl) {
    let url = String(apiConfig.baseUrl).trim();
    if (url && !url.startsWith('http')) url = 'https://' + url;
    config.baseURL = url.endsWith('/') ? url.slice(0, -1) : url;
  }
  if (apiConfig.accessToken) {
    config.headers.Authorization = `Bearer ${apiConfig.accessToken}`;
  }
  config.headers.Accept = 'application/json';
  config.headers['Content-Type'] = 'application/json';
  return config;
});
export async function initSyncService() {
  // Start sync loop
  console.log('🚀 Sync Service Initialized.');
}

export async function syncNow() {
  await syncLoop();
}

async function dbAll(query: string, params: any[] = []) {
  return await db.query(query, params);
}

async function dbRun(query: string, params: any[] = []) {
  return await db.execute(query, params);
}

async function syncLoop() {
  const config = getApiConfig();
  // Skip sync if we have no access token at all
  if (!config.accessToken) {
    console.log('No access token, skipping sync...');
    return;
  }

  console.log('🔄 Starting sync cycle...');
  
  try {
    // 1. Upload Pending Data
    await uploadPendingRecords();

    // 2. Download Fresh Data
    await downloadUpdates();

  } catch (error: any) {
    console.error('❌ Sync cycle failed:', error.message);
  }
}

async function uploadPendingRecords() {
  try {
    const pending = await dbAll(`
      SELECT * FROM sync_queue 
      WHERE status = 'pending' 
      OR (status = 'failed' AND retry_count < 3) 
      LIMIT 20
    `);
    if (pending.length === 0) return;

    console.log(`⬆️ Found ${pending.length} pending records to upload.`);
    
    for (const item of pending) {
      try {
        let endpoint = '';
        let payload: any = {};
        
        try {
          payload = JSON.parse(item.payload || '{}');
        } catch (e: any) {
          console.error(`Malformed JSON in sync_queue ID ${item.id}`);
          await dbRun('UPDATE sync_queue SET status = ?, error_log = ? WHERE id = ?', ['failed', 'Malformed JSON payload', item.id]);
          continue;
        }

        // Map local tables to API endpoints
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
              payments: [{
                amount: payload.amount,
                method: 'cash'
              }]
            };
            break;
          default:
            console.log(`No endpoint mapped for table: ${item.table_name}`);
            continue;
        }

        console.log(`📤 Uploading ${item.table_name} (ID: ${item.record_id}) to ${endpoint}...`);
        console.log('Payload:', JSON.stringify(payload, null, 2));
        
        const response = await apiClient.post(endpoint, payload);
        
        console.log(`Response status: ${response.status}`, JSON.stringify(response.data).slice(0, 200));

        // Standard Axios success is 200/201, but Zimozo API sometimes returns status 200 with an error body
        let hasError = false;
        let apiErrorMsg = '';

        if (response.data) {
          if (response.data.error) {
            hasError = true;
            apiErrorMsg = typeof response.data.error === 'object' ? JSON.stringify(response.data.error) : response.data.error;
          } else if (Array.isArray(response.data)) {
            for (const resItem of response.data) {
              if (resItem.error) {
                hasError = true;
                apiErrorMsg = typeof resItem.error === 'object' ? JSON.stringify(resItem.error) : resItem.error;
                break;
              } else if (resItem.original?.error) {
                hasError = true;
                apiErrorMsg = typeof resItem.original.error === 'object' ? JSON.stringify(resItem.original.error) : resItem.original.error;
                break;
              }
            }
          }
        }

        if (hasError) {
          throw new Error(`API error inside 200 OK: ${apiErrorMsg}`);
        }

        if (response.data?.success || response.status === 200 || response.status === 201) {
          console.log(`✅ ${item.table_name} (${item.record_id}) synced successfully.`);
          await dbRun('UPDATE sync_queue SET status = ?, error_log = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = ?', ['synced', item.id]);
          
           // Try to get the remote ID from the response
          let remoteId = response.data?.data?.id;
          if (!remoteId && Array.isArray(response.data?.data) && response.data.data.length > 0) {
            remoteId = response.data.data[0].id;
          }
          if (!remoteId && Array.isArray(response.data) && response.data.length > 0) {
            remoteId = response.data[0].id;
          }
          if (!remoteId && response.data?.id) {
            remoteId = response.data.id;
          }

          try {
            if (remoteId) {
              await dbRun(`UPDATE ${item.table_name} SET remote_id = ?, sync_status = 'synced' WHERE id = ?`, [remoteId, item.record_id]);
            } else {
              await dbRun(`UPDATE ${item.table_name} SET sync_status = 'synced' WHERE id = ?`, [item.record_id]);
            }
          } catch(e: any) {
            console.error(`Error updating source table ${item.table_name}:`, e.message);
          }
        } else {
          throw new Error(`API returned failure: ${JSON.stringify(response.data)}`);
        }
      } catch (error: any) {
        const errDetail = error.response?.data 
          ? JSON.stringify(error.response.data) 
          : error.message;
        const statusCode = error.response?.status || 'N/A';
        console.error(`❌ Failed to upload ${item.table_name} (${item.record_id}): HTTP ${statusCode}`, errDetail);
        await dbRun(
          'UPDATE sync_queue SET status = ?, error_log = ?, retry_count = retry_count + 1 WHERE id = ?',
          ['failed', `HTTP ${statusCode}: ${errDetail}`, item.id]
        );
        try {
          await dbRun(`UPDATE ${item.table_name} SET sync_status = 'failed' WHERE id = ?`, [item.record_id]);
        } catch (e) {}
      }
    }
  } catch (error: any) {
    console.error('Error in uploadPendingRecords:', error);
  }
}

async function downloadUpdates() {
  try {
    console.log('📡 Fetching fresh data from Cloud ERP...');

    // 0. Download Business Settings & Details + Payment Methods
    try {
      const bizRes = await apiClient.get('/connector/api/business-details');
      const bizData = bizRes.data?.data || bizRes.data;
      if (bizData) {
        const config = getApiConfig();
        config.businessDetails = bizData;

        // Also fetch payment methods and attach
        try {
          const pmRes = await apiClient.get('/connector/api/payment-method');
          const pmList = pmRes.data?.data || pmRes.data || [];
          if (Array.isArray(pmList) && pmList.length > 0) {
            config.businessDetails.custom_payment_methods = pmList.map(pm => ({
              id: pm.id,
              name: pm.name,
              method: pm.method_type || pm.name?.toLowerCase().replace(/\s+/g, '_')
            }));
          }
        } catch (pmErr: any) {
          // Not critical — core methods (cash/card) always work
          console.log('ℹ️ Custom payment methods endpoint skipped:', pmErr.message);
        }

        saveApiConfig(config);
        console.log('✅ Synced live ERP business settings, rules & payment methods.');
      }
    } catch (e: any) {
      console.error('Failed to sync business details:', e.message);
    }

    // 0b. Sync logged-in user's role and permissions from ERP
    try {
      const userRes = await apiClient.get('/connector/api/user/loggedinuser');
      const userData = userRes.data?.data || userRes.data;
      if (userData) {
        const config = getApiConfig();
        config.loggedInUser = {
          name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : userData.name,
          email: userData.email,
          role: userData.roles?.[0]?.name || userData.role_name || 'staff',
          permissions: userData.roles?.[0]?.permissions?.map((p: any) => p.name) || [],
          all_locations: userData.sales_commission_agent?.location_id || null,
          max_discount: userData.max_sales_discount_percent ? parseFloat(userData.max_sales_discount_percent) : null
        };
        saveApiConfig(config);
        // Also upsert into the users table for PIN login
        try {
          await dbRun(`
            INSERT OR REPLACE INTO users (remote_id, name, username, role, sync_status)
            VALUES (?, ?, ?, ?, 'synced')
          `, [userData.id, config.loggedInUser.name, userData.email, config.loggedInUser.role]);
        } catch (dbErr: any) {
          console.error('Failed to save user to DB:', dbErr.message);
        }
        console.log(`✅ Synced user role: ${config.loggedInUser.role}`);
      }
    } catch (e: any) {
      console.log('ℹ️ Could not sync user profile (endpoint may vary):', e.message);
    }

    
    // 1. Download Business Locations
    try {
      const locationsRes = await apiClient.get('/connector/api/business-location');
      const locations = locationsRes.data.data || [];
      if (locations.length > 0) {
        await dbRun('DELETE FROM business_locations');
        for (const loc of locations) {
          await dbRun(`
            INSERT INTO business_locations (remote_id, name, city, state, country, settings_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [loc.id, loc.name, loc.city, loc.state, loc.country, JSON.stringify(loc)]);
        }
        // console.log(`✅ Synced ${locations.length} locations.`);
      }
    } catch (e: any) { console.error('Failed to sync locations:', e.message); }

    // 2. Download Tax Rates
    try {
      const taxRes = await apiClient.get('/connector/api/tax');
      const taxRates = taxRes.data?.data || taxRes.data || [];
      if (taxRates.length > 0) {
        await dbRun('DELETE FROM tax_rates');
        for (const tax of taxRates) {
          await dbRun(`
            INSERT OR REPLACE INTO tax_rates (remote_id, name, amount)
            VALUES (?, ?, ?)
          `, [tax.id, tax.name, parseFloat(tax.amount || 0)]);
        }
      }
    } catch (e: any) { console.error('Failed to sync tax rates:', e.message); }

    // 3. Download Products
    try {
      const productsRes = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
      const products = productsRes.data.data || [];
      if (products.length > 0) {
        await dbRun('DELETE FROM products');
        await dbRun('DELETE FROM product_lots');
        
        let syncedLotsCount = 0;

        for (const prod of products) {
          let price = 0;
          let variationId = 0;
          if (prod.product_variations?.[0]?.variations?.[0]) {
            price = parseFloat(prod.product_variations[0].variations[0].sell_price_inc_tax || 0);
            variationId = prod.product_variations[0].variations[0].id;
          }

          let stock = prod.current_stock || 0;
          let locationStocks: Record<string, number> = {};
          if (prod.product_variations?.[0]?.variations?.[0]?.variation_location_details) {
              const locDetails = prod.product_variations[0].variations[0].variation_location_details;
              stock = locDetails.reduce((sum: number, loc: any) => sum + parseFloat(loc.qty_available || 0), 0);
              locDetails.forEach((ld: any) => {
                  locationStocks[ld.location_id] = parseFloat(ld.qty_available || 0);
              });
          }
          const locationStocksJson = JSON.stringify(locationStocks);

          // Parse real variations
          let parsedVariations = [];
          if (prod.product_variations && prod.product_variations.length > 0) {
            for (const pv of prod.product_variations) {
              if (pv.variations) {
                for (const v of pv.variations) {
                  if (v.name && v.name !== 'DUMMY') {
                    let locStocks: Record<string, number> = {};
                    if (v.variation_location_details) {
                      v.variation_location_details.forEach((ld: any) => {
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
          
          // Infer enableExpiry if not directly provided but expiry_period is set
          const enableExpiry = (prod.enable_expiry !== undefined ? prod.enable_expiry : (prod.expiry_period ? 1 : 0)) || 0;
          const enableSrNo = prod.enable_sr_no || 0;

          // Extract exact assigned locations
          let assignedLocations = [];
          if (Array.isArray(prod.product_locations)) {
            assignedLocations = prod.product_locations.map((l: any) => l.id);
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

          // Extract and sync lot/serial/expiry numbers
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
                            syncedLotsCount++;
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
        console.log(`✅ Synced ${products.length} products and ${syncedLotsCount} lot/expiry records.`);
      }
    } catch (e: any) { console.error('Failed to sync products and lots:', e.message); }

    // 4. Download Contacts (Customers)
    try {
      const customersRes = await apiClient.get('/connector/api/contactapi?type=customer');
      const customers = customersRes.data.data || [];
      if (customers.length > 0) {
        await dbRun('DELETE FROM customers');
        for (const cust of customers) {
          const balance = parseFloat(cust.balance || 0);
          await dbRun(`
            INSERT INTO customers (remote_id, name, phone, email, address, balance, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'synced')
          `, [cust.id, cust.name, cust.mobile, cust.email, cust.city, balance]);
        }
      }
    } catch (e: any) { console.error('Failed to sync customers:', e.message); }

    // console.log('✨ Background sync cycle complete.');
  } catch (error: any) {
    console.error('❌ Sync failed:', error.message);
    throw error;
  }
}
