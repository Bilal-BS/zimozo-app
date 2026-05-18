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
    const panadolProducts = await dbAll("SELECT * FROM products WHERE name LIKE '%PANADOL%'");
    console.log('PANADOL Products:');
    console.log(JSON.stringify(panadolProducts, null, 2));

    if (panadolProducts.length > 0) {
      const productIds = panadolProducts.map(p => p.remote_id);
      const placeholders = productIds.map(() => '?').join(',');
      const lots = await dbAll(`SELECT * FROM product_lots WHERE remote_product_id IN (${placeholders})`, productIds);
      console.log('\nPANADOL Synced Lots:');
      console.log(JSON.stringify(lots, null, 2));
    }

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
