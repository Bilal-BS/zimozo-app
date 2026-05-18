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
    console.log('Testing /connector/api/product-lot endpoint...');
    const res = await apiClient.get('/connector/api/product-lot?per_page=50');
    console.log('Status:', res.status);
    console.log('Data keys:', Object.keys(res.data || {}));
    console.log('Data sample:', JSON.stringify(res.data).slice(0, 500));
  } catch (error) {
    console.error('API Error for /connector/api/product-lot:', error.response?.status, error.response?.data || error.message);
  }
}

main();
