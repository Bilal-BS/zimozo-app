import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

let sqlite: SQLiteConnection | null = null;
let db: SQLiteDBConnection | null = null;

export async function initCapacitorSqlite() {
  if (Capacitor.isNativePlatform()) {
    try {
      sqlite = new SQLiteConnection(CapacitorSQLite);
      const ret = await sqlite.checkConnectionsConsistency();
      const isConn = (await sqlite.isConnection("zimozo_offline.db", false)).result;
      
      if (ret.result && isConn) {
        db = await sqlite.retrieveConnection("zimozo_offline.db", false);
      } else {
        db = await sqlite.createConnection("zimozo_offline.db", false, "no-encryption", 1, false);
      }
      
      await db.open();

      // Ensure Schema (copied from electron/db.js)
      const schema = `
        CREATE TABLE IF NOT EXISTS business_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER UNIQUE, name TEXT, landmark TEXT, city TEXT, state TEXT, country TEXT, zip_code TEXT, settings_json TEXT, is_active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, name TEXT, username TEXT UNIQUE, password TEXT, pin TEXT, role TEXT, sync_status TEXT DEFAULT 'synced', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, name TEXT, phone TEXT, email TEXT, address TEXT, balance REAL DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, name TEXT, phone TEXT, email TEXT, address TEXT, sync_status TEXT DEFAULT 'synced', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, variation_id INTEGER, name TEXT, sku TEXT UNIQUE, barcode TEXT, price REAL, stock_quantity INTEGER, category TEXT, type TEXT DEFAULT 'single', variations_json TEXT, enable_expiry INTEGER DEFAULT 0, enable_sr_no INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'synced', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category_id INTEGER, image_url TEXT, location_stocks_json TEXT, assigned_locations_json TEXT
        );
        CREATE TABLE IF NOT EXISTS product_lots (
          id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, remote_product_id INTEGER, lot_number TEXT, expiry_date TEXT, qty_remaining REAL DEFAULT 0, location_id INTEGER, sync_status TEXT DEFAULT 'synced', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tax_rates (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER UNIQUE, name TEXT, amount REAL
        );
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, customer_id INTEGER, total_amount REAL, tax_amount REAL, discount_amount REAL, payment_method TEXT, payment_status TEXT DEFAULT 'paid', status TEXT DEFAULT 'final', sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, product_id INTEGER, variation_id INTEGER, quantity REAL, unit_price REAL, total REAL, lot_number TEXT, expiry_date TEXT, line_discount_amount REAL, line_discount_type TEXT, warranty_period TEXT
        );
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id INTEGER, category_id INTEGER, amount REAL, note TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS cash_registers (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, location_id INTEGER, status TEXT DEFAULT 'open', opening_amount REAL DEFAULT 0, closing_amount REAL DEFAULT 0, cash_in_hand REAL DEFAULT 0, total_cash_sales REAL DEFAULT 0, total_card_sales REAL DEFAULT 0, total_other_sales REAL DEFAULT 0, opened_at DATETIME DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME, sync_status TEXT DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS cash_register_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, register_id INTEGER, amount REAL, transaction_type TEXT, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id INTEGER, action TEXT, payload TEXT, status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0, error_log TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, synced_at DATETIME
        );
      `;
      await db.execute(schema);
      console.log('Capacitor SQLite initialized');
    } catch (e) {
      console.error('Failed to init SQLite:', e);
    }
  }
}

export async function capacitorQuery(sql: string, params: any[] = []): Promise<any[]> {
  if (!db) return [];
  try {
    const res = await db.query(sql, params);
    return res.values || [];
  } catch (e) {
    console.error('Capacitor DB Query Error:', e, sql, params);
    return [];
  }
}

export async function capacitorExecute(sql: string, params: any[] = []): Promise<any> {
  if (!db) return { changes: 0 };
  try {
    const res = await db.run(sql, params);
    return { changes: res.changes?.changes || 0, id: res.changes?.lastId };
  } catch (e) {
    console.error('Capacitor DB Execute Error:', e, sql, params);
    return { changes: 0 };
  }
}

export async function capacitorWipeDb(): Promise<void> {
  if (!db) return;
  const tables = ['products', 'customers', 'suppliers', 'business_locations', 'product_lots', 'sales', 'sale_items', 'expenses', 'sync_queue'];
  for (const t of tables) {
    await db.execute(`DELETE FROM ${t}`);
  }
}
