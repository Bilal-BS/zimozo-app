import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');

if (!fs.existsSync(configPath)) {
  console.error('Config file not found');
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
    console.log('Fetching products from ERP API...');
    const res = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
    const products = res.data?.data || [];
    console.log(`Fetched ${products.length} products.`);

    let noLocations = 0;
    let locationDistribution = {};

    products.forEach(p => {
      if (!p.product_locations || !Array.isArray(p.product_locations) || p.product_locations.length === 0) {
        noLocations++;
      } else {
        p.product_locations.forEach(loc => {
          locationDistribution[loc.id] = (locationDistribution[loc.id] || 0) + 1;
        });
      }
    });

    console.log('Products with NO product_locations assigned in ERP:', noLocations);
    console.log('Location ID assignment distribution in ERP:', locationDistribution);

    // Let's check a product that has no location assigned
    const unassigned = products.find(p => !p.product_locations || !Array.isArray(p.product_locations) || p.product_locations.length === 0);
    if (unassigned) {
      console.log('\nSample unassigned product:');
      console.log(JSON.stringify({
        id: unassigned.id,
        name: unassigned.name,
        sku: unassigned.sku,
        product_locations: unassigned.product_locations
      }, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
