import sqlite3 from 'sqlite3';
import { app, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(app.getPath('userData'), 'zimozo_offline.db');
let db;

export default function setupDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database at:', dbPath);
      global._db = db; // Store globally for IPC retry handler
      
      // Initialize Schema
      db.serialize(() => {
        // Business Locations
        db.run(`CREATE TABLE IF NOT EXISTS business_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER UNIQUE,
          name TEXT,
          landmark TEXT,
          city TEXT,
          state TEXT,
          country TEXT,
          zip_code TEXT,
          settings_json TEXT,
          is_active INTEGER DEFAULT 1
        )`, () => {
          db.run(`ALTER TABLE business_locations ADD COLUMN settings_json TEXT`, (err) => {});
        });

        // Users
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          name TEXT,
          username TEXT UNIQUE,
          password TEXT,
          pin TEXT,
          role TEXT,
          sync_status TEXT DEFAULT 'synced',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Customers
        db.run(`CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          name TEXT,
          phone TEXT,
          email TEXT,
          address TEXT,
          balance REAL DEFAULT 0,
          sync_status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
          db.run(`ALTER TABLE customers ADD COLUMN balance REAL DEFAULT 0`, (err) => {});
        });

        // Suppliers
        db.run(`CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          name TEXT,
          phone TEXT,
          email TEXT,
          address TEXT,
          sync_status TEXT DEFAULT 'synced',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          variation_id INTEGER,
          name TEXT,
          sku TEXT UNIQUE,
          barcode TEXT,
          price REAL,
          stock_quantity INTEGER,
          category TEXT,
          type TEXT DEFAULT 'single',
          variations_json TEXT,
          enable_expiry INTEGER DEFAULT 0,
          enable_sr_no INTEGER DEFAULT 0,
          sync_status TEXT DEFAULT 'synced',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
          // Add missing columns if they don't exist
          db.run(`ALTER TABLE products ADD COLUMN category_id INTEGER`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN variation_id INTEGER`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'single'`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN variations_json TEXT`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN enable_expiry INTEGER DEFAULT 0`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN enable_sr_no INTEGER DEFAULT 0`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN location_stocks_json TEXT`, (err) => {});
          db.run(`ALTER TABLE products ADD COLUMN assigned_locations_json TEXT`, (err) => {});
        });

        // Product Lots (lot numbers, expiry dates, serial numbers)
        db.run(`CREATE TABLE IF NOT EXISTS product_lots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          remote_product_id INTEGER,
          lot_number TEXT,
          expiry_date TEXT,
          qty_remaining REAL DEFAULT 0,
          location_id INTEGER,
          sync_status TEXT DEFAULT 'synced',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tax Rates table
        db.run(`CREATE TABLE IF NOT EXISTS tax_rates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER UNIQUE,
          name TEXT,
          amount REAL
        )`);

        // Sales
        db.run(`CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          customer_id INTEGER,
          total_amount REAL,
          tax_amount REAL,
          discount_amount REAL,
          payment_method TEXT,
          payment_status TEXT DEFAULT 'paid',
          status TEXT DEFAULT 'final',
          sync_status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
          db.run(`ALTER TABLE sales ADD COLUMN payment_status TEXT`, (err) => {});
        });

        // Sale Items
        db.run(`CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER,
          product_id INTEGER,
          variation_id INTEGER,
          quantity REAL,
          unit_price REAL,
          total REAL,
          FOREIGN KEY(sale_id) REFERENCES sales(id)
        )`, () => {
          db.run(`ALTER TABLE sale_items ADD COLUMN lot_number TEXT`, () => {});
          db.run(`ALTER TABLE sale_items ADD COLUMN expiry_date TEXT`, () => {});
          db.run(`ALTER TABLE sale_items ADD COLUMN line_discount_amount REAL`, () => {});
          db.run(`ALTER TABLE sale_items ADD COLUMN line_discount_type TEXT`, () => {});
          db.run(`ALTER TABLE sale_items ADD COLUMN warranty_period TEXT`, () => {});
        });

        // Expenses
        db.run(`CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          remote_id INTEGER,
          category_id INTEGER,
          amount REAL,
          note TEXT,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          sync_status TEXT DEFAULT 'pending'
        )`);

        // Cash Registers (Shifts)
        db.run(`CREATE TABLE IF NOT EXISTS cash_registers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          location_id INTEGER,
          status TEXT DEFAULT 'open',
          opening_amount REAL DEFAULT 0,
          closing_amount REAL DEFAULT 0,
          cash_in_hand REAL DEFAULT 0,
          total_cash_sales REAL DEFAULT 0,
          total_card_sales REAL DEFAULT 0,
          total_other_sales REAL DEFAULT 0,
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          sync_status TEXT DEFAULT 'pending'
        )`);

        // Cash Register Transactions (Cash In/Out)
        db.run(`CREATE TABLE IF NOT EXISTS cash_register_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          register_id INTEGER,
          amount REAL,
          transaction_type TEXT,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sync_status TEXT DEFAULT 'pending'
        )`);

        // Sync Queue
        db.run(`CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT,
          record_id INTEGER,
          action TEXT,
          payload TEXT,
          status TEXT DEFAULT 'pending',
          retry_count INTEGER DEFAULT 0,
          error_log TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced_at DATETIME
        )`);

        // Backfill: Align source tables where sync_queue records succeeded
        db.run(`UPDATE sales SET sync_status = 'synced' WHERE id IN (SELECT record_id FROM sync_queue WHERE table_name = 'sales' AND status = 'synced')`);
        db.run(`UPDATE expenses SET sync_status = 'synced' WHERE id IN (SELECT record_id FROM sync_queue WHERE table_name = 'expenses' AND status = 'synced')`);
        db.run(`UPDATE customers SET sync_status = 'synced' WHERE id IN (SELECT record_id FROM sync_queue WHERE table_name = 'customers' AND status = 'synced')`);
      });

      resolve(db);
    });

    // Register IPC handlers only once
    ipcMain.handle('db-query', async (event, query, params) => {
      return new Promise((res, rej) => {
        db.all(query, params || [], (err, rows) => {
          if (err) rej(err);
          else res(rows);
        });
      });
    });

    ipcMain.handle('db-execute', async (event, query, params) => {
      return new Promise((res, rej) => {
        db.run(query, params || [], function(err) {
          if (err) rej(err);
          else res({ id: this.lastID, changes: this.changes });
        });
      });
    });

    ipcMain.handle('db-wipe', async () => {
      return new Promise((res, rej) => {
        db.serialize(() => {
          db.run('DELETE FROM products');
          db.run('DELETE FROM customers');
          db.run('DELETE FROM suppliers');
          db.run('DELETE FROM business_locations');
          db.run('DELETE FROM product_lots');
          db.run('DELETE FROM sales');
          db.run('DELETE FROM sale_items');
          db.run('DELETE FROM expenses');
          db.run('DELETE FROM sync_queue', (err) => {
            if (err) rej(err);
            else res({ success: true });
          });
        });
      });
    });
  });
}
