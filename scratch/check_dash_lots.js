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
    const lotNumbers = await dbAll('SELECT DISTINCT lot_number, COUNT(*) as count FROM product_lots GROUP BY lot_number');
    console.log('Distinct lot numbers in product_lots table in SQLite:');
    console.log(JSON.stringify(lotNumbers, null, 2));

    const sampleNullLots = await dbAll(`
      SELECT pl.*, p.name as product_name
      FROM product_lots pl
      JOIN products p ON pl.remote_product_id = p.remote_id
      WHERE pl.lot_number IS NULL OR pl.lot_number = "" OR pl.lot_number = "-"
      LIMIT 10
    `);
    console.log('\nSample lots with null/empty/dash lot numbers:');
    console.log(JSON.stringify(sampleNullLots, null, 2));

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
