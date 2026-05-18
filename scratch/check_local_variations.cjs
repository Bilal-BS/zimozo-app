const sqlite3 = require('sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zimozo-windows-app', 'zimozo_offline.db');

console.log('Checking database at:', appDataPath);

if (!fs.existsSync(appDataPath)) {
  console.error('Database file does not exist at path!');
  process.exit(1);
}

const db = new sqlite3.Database(appDataPath);

db.serialize(() => {
  db.all('SELECT remote_id, name, type, variations_json, enable_expiry, enable_sr_no FROM products', (err, rows) => {
    if (err) {
      console.error('Error querying products:', err);
      return;
    }
    
    console.log(`Total products inside local SQLite: ${rows.length}`);
    const variableProducts = rows.filter(r => r.type === 'variable' || r.variations_json);
    console.log(`Products with variations/lots: ${variableProducts.length}`);
    
    if (variableProducts.length > 0) {
      console.log('\n--- Sample Products with Variations ---');
      variableProducts.slice(0, 10).forEach(p => {
        console.log(`ID: ${p.remote_id} | Name: ${p.name} | Type: ${p.type}`);
        console.log(`Variations JSON: ${p.variations_json}`);
        console.log(`Expiry: ${p.enable_expiry} | Lot: ${p.enable_sr_no}`);
        console.log('--------------------------------------');
      });
    } else {
      console.log('No variable products or variation JSON found in SQLite!');
    }
    
    db.close();
  });
});
