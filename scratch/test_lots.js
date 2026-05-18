import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');

if (!fs.existsSync(configPath)) {
  console.error('Config file not found at:', configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const apiClient = axios.create({
  baseURL: config.baseUrl?.trim().endsWith('/') ? config.baseUrl.trim().slice(0, -1) : config.baseUrl.trim(),
  headers: {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  httpsAgent
});

async function main() {
  try {
    console.log('Scanning all products for any lot_details containing expiry/exp...');
    const res = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
    const products = res.data?.data || [];
    
    let allKeys = new Set();
    let foundLots = [];
    
    for (const p of products) {
      const vars = p.product_variations?.[0]?.variations?.[0] || {};
      const locDetails = vars.variation_location_details || [];
      for (const ld of locDetails) {
        if (ld.lot_details && ld.lot_details.length > 0) {
          ld.lot_details.forEach(lot => {
            Object.keys(lot).forEach(k => allKeys.add(k));
            foundLots.push({ product: p.name, lot });
          });
        }
      }
    }
    
    console.log('\nAll unique keys found in any lot_details:', Array.from(allKeys));
    console.log(`Total lot details objects scanned: ${foundLots.length}`);
    
    const withExpiry = foundLots.filter(item => {
      return Object.keys(item.lot).some(k => k.toLowerCase().includes('exp') || k.toLowerCase().includes('date'));
    });
    
    console.log(`Lots with 'exp' or 'date' in keys: ${withExpiry.length}`);
    if (withExpiry.length > 0) {
      console.log('Sample lot with expiry:', withExpiry[0]);
    } else {
      console.log('No lots had keys with exp or date.');
      // Print first 5 lots in general just to inspect values
      console.log('First 5 lots:', foundLots.slice(0, 5));
    }
  } catch (error) {
    console.error('API Error:', error.message);
  }
}

main();
