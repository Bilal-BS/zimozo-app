import axios from 'axios';
import fs from 'fs';
import path from 'path';

const configPath = 'C:\\Users\\Bilal\\AppData\\Roaming\\zimozo-windows-app\\api_config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const payload = {
  sells: [
    {
      location_id: 58,
      contact_id: null,
      status: "final",
      transaction_date: "2026-05-17 04:52:39",
      final_total: 12995,
      products: [
        {
          product_id: 6073,
          variation_id: 6117,
          quantity: 1,
          unit_price: 3500,
          line_discount_amount: 0,
          line_discount_type: "fixed",
          tax_id: null
        },
        {
          product_id: 6074,
          variation_id: 6118,
          quantity: 1,
          unit_price: 3700,
          line_discount_amount: 0,
          line_discount_type: "fixed",
          tax_id: null
        },
        {
          product_id: 6076,
          variation_id: 6120,
          quantity: 1,
          unit_price: 4100,
          line_discount_amount: 0,
          line_discount_type: "fixed",
          tax_id: null
        }
      ],
      payments: [
        {
          amount: 12995,
          method: "cash",
          note: "POS Sale"
        }
      ]
    }
  ]
};

console.log('Sending to ERP:', config.baseUrl + '/connector/api/sell');
axios.post(config.baseUrl + '/connector/api/sell', payload, {
  headers: {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log('Response Status:', res.status);
  console.log('Response Data:', JSON.stringify(res.data, null, 2));
}).catch(err => {
  console.error('Error Status:', err.response?.status);
  console.error('Error Data:', JSON.stringify(err.response?.data, null, 2) || err.message);
});
