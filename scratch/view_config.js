import path from 'path';
import fs from 'fs';

const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const configPath = path.join(appData, 'zimozo-windows-app', 'api_config.json');

if (!fs.existsSync(configPath)) {
  console.error('Config file not found');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('API config values (hiding secret tokens):');
console.log({
  baseUrl: config.baseUrl,
  username: config.username,
  clientId: config.clientId,
  loggedInUser: config.loggedInUser,
  activeLocation: config.activeLocation
});
