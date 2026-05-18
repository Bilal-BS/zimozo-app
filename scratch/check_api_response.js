// scratch/check_api_response.js
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Find API config in Roaming/zimozo-windows-app
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

async function main() {
  try {
    console.log('Fetching sample products...');
    const res = await apiClient.get('/connector/api/product?per_page=10');
    const products = res.data?.data || [];
    console.log(`Fetched ${products.length} products.`);

    if (products.length > 0) {
      // Find a variable product or a product with stocks/expiries if possible
      const variableProd = products.find(p => p.type === 'variable' || p.product_variations?.[0]?.variations?.length > 1) || products[0];
      fs.writeFileSync(path.join('scratch', 'sample_product.json'), JSON.stringify(variableProd, null, 2));
      console.log('Saved sample product to scratch/sample_product.json');
    }

    console.log('Fetching sample customers...');
    const custRes = await apiClient.get('/connector/api/contactapi?type=customer&per_page=10');
    const customers = custRes.data?.data || [];
    if (customers.length > 0) {
      fs.writeFileSync(path.join('scratch', 'sample_customer.json'), JSON.stringify(customers[0], null, 2));
      console.log('Saved sample customer to scratch/sample_customer.json');
    }

    console.log('Fetching tax rates...');
    try {
      const taxRes = await apiClient.get('/connector/api/tax');
      fs.writeFileSync(path.join('scratch', 'sample_tax.json'), JSON.stringify(taxRes.data, null, 2));
      console.log('Saved tax rates to scratch/sample_tax.json');
    } catch (e) {
      console.log('Failed to fetch tax rates:', e.message);
    }
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
  }
}

main();
