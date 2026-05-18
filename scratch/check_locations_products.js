import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';

const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const dbPath = path.join(appData, 'zimozo-windows-app', 'zimozo_offline.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

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
    const products = await dbAll('SELECT remote_id, name, assigned_locations_json, location_stocks_json FROM products');
    
    const locationCounts = {};
    const stockLocationCounts = {};
    
    products.forEach(p => {
      try {
        const assigned = JSON.parse(p.assigned_locations_json || '[]');
        assigned.forEach(locId => {
          locationCounts[locId] = (locationCounts[locId] || 0) + 1;
        });
      } catch (e) {}

      try {
        const stocks = JSON.parse(p.location_stocks_json || '{}');
        Object.keys(stocks).forEach(locId => {
          stockLocationCounts[locId] = (stockLocationCounts[locId] || 0) + 1;
        });
      } catch (e) {}
    });

    console.log('Product counts by assigned_locations_json:');
    console.log(locationCounts);
    
    console.log('\nProduct counts by location_stocks_json:');
    console.log(stockLocationCounts);

    db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
