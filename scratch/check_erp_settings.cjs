const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

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

async function testEndpoint(name, url) {
  console.log(`\n--- Testing ${name} (${url}) ---`);
  try {
    const res = await apiClient.get(url);
    console.log(`Success! Status: ${res.status}`);
    const data = res.data?.data || res.data;
    console.log('Response structure preview:');
    console.log(JSON.stringify(data, null, 2).slice(0, 800));
    
    // Save to scratch
    fs.writeFileSync(path.join('scratch', `erp_${name.toLowerCase().replace(/ /g, '_')}.json`), JSON.stringify(data, null, 2));
    console.log(`Saved full response to scratch/erp_${name.toLowerCase().replace(/ /g, '_')}.json`);
  } catch (error) {
    console.log(`Failed: ${error.response?.data?.message || error.response?.data?.error || error.message}`);
    if (error.response?.data) {
      console.log('Error payload:', JSON.stringify(error.response.data).slice(0, 300));
    }
  }
}

async function main() {
  await testEndpoint('User Profile', '/connector/api/user');
  await testEndpoint('Business Details', '/connector/api/business-details');
}

main();
