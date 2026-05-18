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
    const res = await apiClient.get('/connector/api/product?per_page=5&send_lot_detail=1');
    const products = res.data?.data || [];
    
    if (products.length > 0) {
      console.log('Keys of first product:');
      console.log(Object.keys(products[0]));
      
      console.log('\nKeys of product_locations for first product:');
      console.log(products[0].product_locations);
      
      console.log('\nFirst product location details under variation_location_details:');
      const vld = products[0].product_variations?.[0]?.variations?.[0]?.variation_location_details;
      console.log(JSON.stringify(vld, null, 2));

      console.log('\nComplete first product structure (abbreviated):');
      const abbreviated = { ...products[0] };
      delete abbreviated.product_variations;
      console.log(JSON.stringify(abbreviated, null, 2));
    } else {
      console.log('No products found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
