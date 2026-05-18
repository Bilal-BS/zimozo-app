import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');

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
    const res = await apiClient.get('/connector/api/product?per_page=-1&send_lot_detail=1');
    const products = res.data?.data || [];
    const panadol = products.find(p => p.name.toLowerCase().includes('panadol'));

    console.log('PANADOL ERP Live Product Details:');
    console.log(JSON.stringify(panadol, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
