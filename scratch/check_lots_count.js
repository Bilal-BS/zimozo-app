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
    const lotCounts = await dbAll('SELECT COUNT(*) as count FROM product_lots');
    console.log('Total lot entries in database:', lotCounts[0].count);

    const dashLots = await dbAll('SELECT COUNT(*) as count FROM product_lots WHERE lot_number = "-"');
    console.log('Total fallback dash lots ("-") in database:', dashLots[0].count);

    const productsWithLots = await dbAll('SELECT COUNT(DISTINCT remote_product_id) as count FROM product_lots');
    console.log('Total unique products with lots in database:', productsWithLots[0].count);

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
