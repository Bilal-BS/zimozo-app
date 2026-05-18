// electron/api_config.js
import axios from 'axios';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

const configPath = path.join(app.getPath('userData'), 'api_config.json');

export const getApiConfig = () => {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return {
    baseUrl: 'https://demo.zimozo.com', // Default or user-provided
    clientId: '',
    clientSecret: '',
    username: '',
    password: '',
    accessToken: '',
    lastSync: null
  };
};

export const saveApiConfig = (config) => {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};

export const authenticate = async () => {
  const config = getApiConfig();
  console.log('Authenticating with config:', { 
    baseUrl: config.baseUrl, 
    clientId: config.clientId, 
    hasSecret: !!config.clientSecret 
  });
  
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`API Client ID or Secret missing. Found ID: ${config.clientId}, Has Secret: ${!!config.clientSecret}`);
  }

  const baseUrl = config.baseUrl?.trim();
  const clientId = config.clientId?.trim();
  let clientSecret = config.clientSecret?.trim() || '';
  const username = config.username?.trim();
  const password = config.password?.trim();

  // Advanced cleaning: If the user pasted "Name - Secret" or similar, extract just the secret
  // Usually secrets are 40+ alphanumeric chars
  const tokenMatch = clientSecret.match(/[a-zA-Z0-9]{30,}/);
  if (tokenMatch) {
    clientSecret = tokenMatch[0];
  }

  try {
    const response = await axios.post(`${baseUrl}/oauth/token`, {
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: password,
      scope: '*'
    }, { httpsAgent });

    config.accessToken = response.data.access_token;
    saveApiConfig(config);
    return config.accessToken;
  } catch (error) {
    console.error('Authentication failed:', error.response?.data || error.message);
    throw error;
  }
};

export const apiClient = axios.create({
  httpsAgent,
  timeout: 15000 // 15 seconds timeout
});

apiClient.interceptors.request.use(async (config) => {
  try {
    const apiConfig = getApiConfig();
    
    if (apiConfig.baseUrl) {
      let url = String(apiConfig.baseUrl).trim();
      if (url && !url.startsWith('http')) {
        url = 'https://' + url;
      }
      // Ensure no double slashes when joining with endpoint
      config.baseURL = url.endsWith('/') ? url.slice(0, -1) : url;
    }
    
    if (apiConfig.accessToken) {
      config.headers.Authorization = `Bearer ${apiConfig.accessToken}`;
    }
    
    config.headers.Accept = 'application/json';
    config.headers['Content-Type'] = 'application/json';
    return config;
  } catch (error) {
    console.error('Error in API interceptor:', error);
    return config;
  }
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, try to re-authenticate only if we have credentials
      const apiConfig = getApiConfig();
      if (apiConfig.clientId && apiConfig.username && apiConfig.password) {
        try {
          const newToken = await authenticate();
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(error.config);
        } catch (authError) {
          return Promise.reject(authError);
        }
      }
    }
    return Promise.reject(error);
  }
);
