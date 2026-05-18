import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';
import sqlite3 from 'sqlite3';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');

if (!fs.existsSync(configPath)) {
  console.error('Config file not found at:', configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('Using baseUrl:', config.baseUrl);

const apiClient = axios.create({
  baseURL: config.baseUrl?.trim().endsWith('/') ? config.baseUrl.trim().slice(0, -1) : config.baseUrl.trim(),
  headers: {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  httpsAgent
});

const dbPath = 'C:\\Users\\Bilal\\AppData\\Roaming\\zimozo-windows-app\\zimozo_offline.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
});

async function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

async function main() {
  try {
    console.log('Downloading business locations...');
    const locationsRes = await apiClient.get('/connector/api/business-location');
    const locations = locationsRes.data.data || [];
    console.log(`Fetched ${locations.length} locations.`);
    
    if (locations.length > 0) {
      console.log('Cleaning local business_locations...');
      await dbRun('DELETE FROM business_locations');
      console.log('Cleared table.');
      
      for (const loc of locations) {
        console.log(`Inserting location: ${loc.name} (remote_id: ${loc.id})`);
        try {
          await dbRun(`
            INSERT INTO business_locations (remote_id, name, city, state, country, settings_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [loc.id, loc.name, loc.city, loc.state, loc.country, JSON.stringify(loc)]);
          console.log(`Success inserting ${loc.name}`);
        } catch (dbErr) {
          console.error(`Error inserting ${loc.name}:`, dbErr.message);
        }
      }
      console.log('Finished inserting.');
    }
  } catch (error) {
    console.error('Failed to sync locations:', error.message);
  } finally {
    db.close();
  }
}

main();
