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
    console.log('Inspecting business_locations...');
    const locations = await dbAll('SELECT id, remote_id, name FROM business_locations');
    console.log(JSON.stringify(locations, null, 2));
    db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
