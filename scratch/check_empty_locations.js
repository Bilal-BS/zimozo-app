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
    const all = await dbAll('SELECT COUNT(*) as count FROM products');
    const emptyAssigned = await dbAll('SELECT COUNT(*) as count FROM products WHERE assigned_locations_json IS NULL OR assigned_locations_json = "[]"');
    const emptyStocks = await dbAll('SELECT COUNT(*) as count FROM products WHERE location_stocks_json IS NULL OR location_stocks_json = "{}"');
    
    console.log('Total products in SQLite:', all[0].count);
    console.log('Products with empty assigned_locations_json:', emptyAssigned[0].count);
    console.log('Products with empty location_stocks_json:', emptyStocks[0].count);
    
    console.log('\nSample products with empty assigned_locations_json:');
    const samples = await dbAll('SELECT remote_id, name, assigned_locations_json, location_stocks_json FROM products WHERE assigned_locations_json IS NULL OR assigned_locations_json = "[]" LIMIT 5');
    console.log(JSON.stringify(samples, null, 2));

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
