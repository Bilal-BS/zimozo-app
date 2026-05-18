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
    
    console.log('--- Current DB State ---');
    console.log('Total products in SQLite:', all[0].count);
    console.log('Products with empty assigned_locations_json:', emptyAssigned[0].count);
    console.log('Products with empty location_stocks_json:', emptyStocks[0].count);

    const products = await dbAll('SELECT assigned_locations_json FROM products');
    const locationCounts = {};
    products.forEach(p => {
      try {
        const assigned = JSON.parse(p.assigned_locations_json || '[]');
        assigned.forEach(locId => {
          locationCounts[locId] = (locationCounts[locId] || 0) + 1;
        });
      } catch (e) {}
    });
    console.log('Product counts by assigned_locations_json:', locationCounts);

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
