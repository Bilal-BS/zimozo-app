import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Globe, 
  Lock, 
  User, 
  Save, 
  Key,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer as PrinterIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const electronAPI = (window as any).electronAPI;

export default function Settings() {
  const [config, setConfig] = useState<any>({
    baseUrl: '',
    clientId: '16',
    clientSecret: '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K',
    username: '',
    password: '',
    accessToken: '',
    receiptPrinter: '',
    silentPrint: true
  });
  const [systemPrinters, setSystemPrinters] = useState<any[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'loading' | null, message: string }>({ type: null, message: '' });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    let settings: any = null;
    if (electronAPI) {
      settings = await electronAPI.getSettings();
    } else {
      try {
        const local = localStorage.getItem('zimozo_api_config');
        settings = local ? JSON.parse(local) : null;
      } catch (e) {
        console.error('Failed to parse settings from localStorage:', e);
      }
    }

    if (settings) {
      setConfig((prev: any) => ({ 
        baseUrl: '',
        username: '',
        password: '',
        accessToken: '',
        receiptPrinter: '',
        silentPrint: true,
        ...prev,
        ...settings,
        clientId: settings.clientId || '16',
        clientSecret: settings.clientSecret || '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K'
      }));
    }

    if (electronAPI) {
      try {
        const printers = await electronAPI.getPrinters();
        setSystemPrinters(printers || []);
      } catch (err) {
        console.error('Failed to load system printers:', err);
      }
    }
  }

  const handleSave = async () => {
    setStatus({ type: 'loading', message: 'Saving settings...' });
    try {
      if (electronAPI?.saveSettings) {
        await electronAPI.saveSettings(config);
      } else {
        localStorage.setItem('zimozo_api_config', JSON.stringify(config));
      }
      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    }
  };

  const handleConnect = async () => {
    setStatus({ type: 'loading', message: 'Connecting to Zimozo Cloud...' });
    try {
      await handleSave();
      if (electronAPI?.authenticate) {
        await electronAPI.authenticate();
      } else {
        // Direct OAuth token request for mobile / browser settings connection
        const tokenUrl = `${config.baseUrl.trim()}/oauth/token`;
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            grant_type: 'password',
            client_id: config.clientId.trim(),
            client_secret: config.clientSecret.trim(),
            username: config.username.trim(),
            password: config.password.trim(),
            scope: '*'
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || 'Invalid credentials or connection failure.');
        }

        const oauthData = await response.json();
        const accessToken = oauthData.access_token;

        const finalConfig = {
          ...config,
          accessToken: accessToken
        };

        // Cache profile details
        const userRes = await fetch(`${config.baseUrl.trim()}/api/user-details`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          const erpUser = userData?.data || userData;
          finalConfig.loggedInUser = {
            name: erpUser.name,
            role: erpUser.role || 'admin',
            permissions: erpUser.permissions || [],
            email: erpUser.email
          };
        }

        localStorage.setItem('zimozo_api_config', JSON.stringify(finalConfig));
      }
      setStatus({ type: 'success', message: 'Connected successfully! Access token retrieved.' });
      loadSettings();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Connection failed: ${error}` });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
          <p className="text-slate-500 dark:text-slate-400">Configure your cloud connection and branch preferences.</p>
        </div>
        <div className="flex items-center gap-3">
           {status.type === 'loading' && <RefreshCw className="animate-spin text-primary" size={20} />}
           {status.type === 'success' && <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-medium"><CheckCircle2 size={16}/> {status.message}</div>}
           {status.type === 'error' && <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm font-medium"><AlertCircle size={16}/> {status.message}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 font-bold">
              <Globe size={20} className="text-primary" />
              Cloud Configuration
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">API Base URL</label>
                <input 
                  type="text" 
                  placeholder="https://pos.zimozo.com" 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                />
                <p className="text-xs text-slate-400">The central Zimozo ERP server URL.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Client ID</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={config.clientId}
                    onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Client Secret</label>
                  <input 
                    type="password" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={config.clientSecret}
                    onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 font-bold">
              <User size={20} className="text-primary" />
              User Credentials
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Sync Username</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Sync Password</label>
                  <input 
                    type="password" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handleConnect}
              className="flex-1 bg-primary text-primary-foreground py-4 rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <Key size={20} /> Test Connection & Auth
            </button>
            <button 
              onClick={handleSave}
              className="px-8 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-4 rounded-xl font-bold hover:bg-slate-300 transition-all flex items-center justify-center gap-2"
            >
              <Save size={20} /> Save Only
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-2 font-bold">
              <Lock size={20} className="text-blue-400" />
              Auth Token Status
            </div>
            <div className="space-y-2">
               <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Active Token</p>
               <div className="p-3 bg-white/5 rounded-lg border border-white/10 overflow-hidden text-xs font-mono break-all line-clamp-3">
                 {config.accessToken || 'No active token. Please connect.'}
               </div>
            </div>
            {config.accessToken && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle2 size={14} /> Token is active and valid
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
             <h3 className="font-bold flex items-center gap-2">
               <SettingsIcon size={18} className="text-slate-400" />
               Branch Settings
             </h3>
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Default Location ID</label>
                <select className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none text-sm font-medium">
                  <option>1 - Main Branch</option>
                  <option>2 - Warehouse A</option>
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Automatic Sync Interval</label>
                <select className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none text-sm font-medium">
                  <option>Every 1 minute</option>
                  <option>Every 5 minutes</option>
                  <option>Manual Only</option>
                </select>
             </div>
          </div>

          {/* Printer Configuration */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
             <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
               <PrinterIcon size={18} className="text-slate-400" />
               Printer Settings
             </h3>
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Receipt Printer</label>
                <select 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-primary"
                  value={config.receiptPrinter || ''}
                  onChange={(e) => setConfig({ ...config, receiptPrinter: e.target.value })}
                >
                  <option value="">System Default Printer</option>
                  {systemPrinters.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
             </div>
             <div className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-all">
                <div>
                   <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Instant Silent Print</label>
                   <span className="text-[10px] text-slate-400">Print instantly without dialog</span>
                </div>
                <input 
                  type="checkbox"
                  className="w-4 h-4 text-primary bg-slate-100 border-slate-300 rounded focus:ring-primary focus:ring-2 cursor-pointer"
                  checked={config.silentPrint ?? true}
                  onChange={(e) => setConfig({ ...config, silentPrint: e.target.checked })}
                />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
