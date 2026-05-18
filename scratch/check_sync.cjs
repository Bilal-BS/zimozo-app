const sqlite3 = require('sqlite3');
const path = require('path');
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const dbPath = path.join(appData, 'zimozo-windows-app', 'zimozo_offline.db');
const db = new sqlite3.Database(dbPath);
db.all('SELECT * FROM sync_queue WHERE status = "failed"', (err, rows) => {
  console.log('Failed Sync:', JSON.stringify(rows, null, 2));
});
