import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import setupDatabase from './db.js';

import { initSyncService } from './sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Don't show until ready-to-show
  });

  // Load Vite dev server or local file
  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize Database
  const db = await setupDatabase();
  
  // Initialize Sync Service
  initSyncService(db);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { getApiConfig, saveApiConfig, authenticate } from './api_config.js';

// IPC handlers can go here
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-settings', () => getApiConfig());
ipcMain.handle('save-settings', (event, settings) => saveApiConfig(settings));
ipcMain.handle('api-authenticate', async () => {
  try {
    return await authenticate();
  } catch (error) {
    throw error.message;
  }
});

import { syncNow } from './sync.js';
ipcMain.handle('sync-now', async () => {
  await syncNow();
  return { success: true };
});

ipcMain.handle('retry-failed-sync', async () => {
  return new Promise((resolve, reject) => {
    const dbInstance = global._db;
    if (!dbInstance) return resolve({ reset: 0 });
    
    // First, find all failed records
    dbInstance.all("SELECT table_name, record_id FROM sync_queue WHERE status = 'failed'", [], (err, rows) => {
      if (err) {
        console.error('Failed to get sync queue for retry:', err);
      } else if (rows && rows.length > 0) {
        // Reset their sync status in original tables
        for (const item of rows) {
          dbInstance.run(`UPDATE ${item.table_name} SET sync_status = 'pending' WHERE id = ?`, [item.record_id], (e) => {
            if (e) console.error(`Error resetting sync_status on table ${item.table_name}:`, e.message);
          });
        }
      }
      
      // Now reset the sync queue
      dbInstance.run(
        'UPDATE sync_queue SET status = ?, retry_count = 0, error_log = NULL WHERE status = ? OR (status = ? AND retry_count >= 3)',
        ['pending', 'failed', 'failed'],
        function(err2) {
          if (err2) reject(err2);
          else resolve({ reset: this.changes });
        }
      );
    });
  });
});

ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
    return !isFullScreen;
  }
  return false;
});

ipcMain.handle('get-printers', async () => {
  if (mainWindow) {
    return await mainWindow.webContents.getPrintersAsync();
  }
  return [];
});

ipcMain.handle('print-receipt', async (event, { html, printerName, silent = true }) => {
  return new Promise((resolve, reject) => {
    try {
      let printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const styledHtml = `
        <html>
          <head>
            <style>
              @page {
                margin: 0;
                size: auto;
              }
              body {
                margin: 0;
                padding: 10px;
                font-family: 'Arial', sans-serif;
                font-size: 11px;
                color: #000;
              }
              #printable-receipt-container {
                width: 100%;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                padding: 4px 0;
                font-size: 10px;
              }
              .text-right {
                text-align: right;
              }
              .text-center {
                text-align: center;
              }
              .font-bold {
                font-weight: bold;
              }
              .border-bottom {
                border-bottom: 1px dashed #000;
              }
              .border-top {
                border-top: 1px dashed #000;
              }
              .margin-top {
                margin-top: 8px;
              }
              .logo {
                font-size: 14px;
                font-weight: 900;
                text-transform: uppercase;
                margin-bottom: 4px;
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);

      printWindow.webContents.once('did-finish-load', () => {
        const printOptions = {
          silent: silent,
          printBackground: true,
          margins: {
            marginType: 'none'
          }
        };

        if (printerName) {
          printOptions.deviceName = printerName;
        }

        printWindow.webContents.print(printOptions, (success, errorType) => {
          printWindow.close();
          printWindow = null;
          if (success) {
            resolve({ success: true });
          } else {
            reject(new Error(`Print failed: ${errorType}`));
          }
        });
      });
    } catch (err) {
      reject(err);
    }
  });
});

