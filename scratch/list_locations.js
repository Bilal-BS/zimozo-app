import sqlite3 from 'sqlite3';

const dbPath = 'C:\\Users\\Bilal\\AppData\\Roaming\\zimozo-windows-app\\zimozo_offline.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
});

db.all("SELECT * FROM business_locations", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Locations count:', rows.length);
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
