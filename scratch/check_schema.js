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
    const tableInfo = await dbAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'");
    console.log('Products Table Schema:');
    console.log(tableInfo[0]?.sql);

    const lotsInfo = await dbAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_lots'");
    console.log('\nProduct Lots Table Schema:');
    console.log(lotsInfo[0]?.sql);

    db.close();
  } catch (error) {
    console.error(error);
  }
}

main();
