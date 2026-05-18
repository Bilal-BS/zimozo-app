import sqlite3 from 'sqlite3';

const dbPath = 'C:\\Users\\Bilal\\AppData\\Roaming\\zimozo-windows-app\\zimozo_offline.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
});

db.run("ALTER TABLE business_locations ADD COLUMN settings_json TEXT", [], (err) => {
  if (err) {
    console.log('Migration status:', err.message);
  } else {
    console.log('Successfully added settings_json to business_locations table!');
  }
  db.close();
});
