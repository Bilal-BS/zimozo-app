import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testLogin() {
  const baseUrl = 'https://erp.zimozo.lk';
  const clientId = '16';
  const clientSecret = '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K';
  const username = 'bilal-s';
  const password = 'b2912112';

  console.log('Testing Password Grant...');
  try {
    const res = await axios.post(`${baseUrl}/oauth/token`, {
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: password,
      scope: '*'
    }, { httpsAgent });
    console.log('Success!', res.data);
  } catch (err) {
    console.log('Password Grant Failed:', err.response?.status, err.response?.data || err.message);
  }

  console.log('\nTesting Direct Token...');
  try {
    const res = await axios.get(`${baseUrl}/connector/api/user-loggedin`, {
      headers: { Authorization: `Bearer ${clientSecret}` },
      httpsAgent
    });
    console.log('Token Success!', res.data);
  } catch (err) {
    console.log('Token Failed:', err.response?.status, err.response?.data || err.message);
  }
}

testLogin();
