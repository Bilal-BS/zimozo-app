const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Add more database or system calls here
  queryDb: (query, params) => ipcRenderer.invoke('db-query', query, params),
  executeDb: (query, params) => ipcRenderer.invoke('db-execute', query, params),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  authenticate: () => ipcRenderer.invoke('api-authenticate'),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  retryFailedSync: () => ipcRenderer.invoke('retry-failed-sync'),
  wipeDb: () => ipcRenderer.invoke('db-wipe'),
  toggleFullScreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (html, printerName, silent) => ipcRenderer.invoke('print-receipt', { html, printerName, silent }),
});
