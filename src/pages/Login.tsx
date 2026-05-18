import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  User, 
  Globe, 
  ArrowRight, 
  ShieldCheck,
  Building2,
  RefreshCw
} from 'lucide-react';
import { syncNow } from '@/services/syncService';
import { capacitorWipeDb } from '@/services/sqlite';
import { cn } from '@/lib/utils';

const electronAPI = (window as any).electronAPI;

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [config, setConfig] = useState<any>(null);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [formData, setFormData] = useState({
    url: 'https://erp.zimozo.lk',
    username: '',
    password: '',
    pin: '',
    clientId: '16',
    clientSecret: '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K'
  });
  const [status, setStatus] = useState<{ type: 'error' | 'loading' | null, message: string }>({ type: null, message: '' });

  useEffect(() => {
    checkConfiguration();
  }, []);

  async function checkConfiguration() {
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
      if (settings.baseUrl) {
        setIsFirstTime(false);
        setFormData(prev => ({ 
          ...prev, 
          url: settings.baseUrl,
          clientId: settings.clientId || '16',
          clientSecret: settings.clientSecret || '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K'
        }));
      }
      setConfig(settings);
    }
  }

  const [loginMethod, setLoginMethod] = useState<'standard' | 'token'>('standard');

  const saveSettingsHelper = async (settings: any) => {
    if (electronAPI?.saveSettings) {
      await electronAPI.saveSettings(settings);
    } else {
      try {
        localStorage.setItem('zimozo_api_config', JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save settings to localStorage:', e);
      }
    }
    setConfig(settings);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Authenticating...' });

    try {
      if (loginMethod === 'token') {
        const tokenConfig = {
          ...config,
          baseUrl: formData.url,
          accessToken: formData.clientSecret
        };
        await saveSettingsHelper(tokenConfig);
        
        // Sync to get real user role even for token login
        if (electronAPI && electronAPI.syncNow) {
          setStatus({ type: 'loading', message: 'Syncing ERP data & roles...' });
          try { await electronAPI.syncNow(); } catch (_) {}
        }
        
        let freshSettings = config;
        if (electronAPI) {
          freshSettings = await electronAPI.getSettings();
        } else {
          try {
            const local = localStorage.getItem('zimozo_api_config');
            freshSettings = local ? JSON.parse(local) : config;
          } catch (_) {}
        }
        
        const erpUser = freshSettings?.loggedInUser;
        onLoginSuccess({ 
          name: erpUser?.name || 'ERP User', 
          role: erpUser?.role || 'admin',
          permissions: erpUser?.permissions || []
        });
        return;
      }

      // 1. Save all settings (including Client ID/Secret if first time)
      let cleanedSecret = (formData.clientSecret || config?.clientSecret || '').trim();
      const tokenMatch = cleanedSecret.match(/[a-zA-Z0-9]{30,}/);
      if (tokenMatch) {
        cleanedSecret = tokenMatch[0];
      }

      const updatedConfig = { 
        ...config, 
        baseUrl: formData.url.trim(),
        clientId: (formData.clientId || config?.clientId)?.toString().trim(),
        clientSecret: cleanedSecret,
        username: formData.username.trim(),
        password: formData.password.trim()
      };
      
      await saveSettingsHelper(updatedConfig);

      // 2. Attempt Authentication
      if (mode === 'pin') {
        if (electronAPI) {
          // Check PIN against real users in local SQLite DB
          const usersInDb = await electronAPI.queryDb(
            'SELECT * FROM users WHERE pin = ? LIMIT 1',
            [formData.pin]
          );
          if (usersInDb && usersInDb.length > 0) {
            const dbUser = usersInDb[0];
            onLoginSuccess({ name: dbUser.name || dbUser.username, role: dbUser.role || 'cashier' });
          } else {
            setStatus({ type: 'error', message: 'Invalid PIN. Please try again.' });
          }
        } else {
          // Android standalone user login fallback
          if (formData.pin === '1234') {
            onLoginSuccess({ name: 'Admin Fallback', role: 'admin' });
          } else {
            setStatus({ type: 'error', message: 'Offline PIN login unsupported without Electron. Use 1234.' });
          }
        }
        return;
      } else {
        // Password / OAuth login
        if (electronAPI) {
          // Wipe old data first for fresh account
          if (electronAPI.wipeDb) await electronAPI.wipeDb();
          await electronAPI.authenticate();
          
          // Auto-Sync after login — this fetches roles too
          if (electronAPI.syncNow) {
            setStatus({ type: 'loading', message: 'Syncing ERP data & roles...' });
            await electronAPI.syncNow();
          }
          
          // Read the real synced user role from ERP settings
          const freshSettings = await electronAPI.getSettings();
          const erpUser = freshSettings?.loggedInUser;
          onLoginSuccess({ 
            name: erpUser?.name || formData.username, 
            role: erpUser?.role || 'admin',
            permissions: erpUser?.permissions || [],
            email: erpUser?.email || formData.username,
            max_discount: erpUser?.max_discount !== undefined ? erpUser.max_discount : null
          });
        } else {
          // Native Direct REST API Login for Android / Mobile
          setStatus({ type: 'loading', message: 'Connecting directly to Zimozo Cloud...' });
          
          const tokenUrl = `${formData.url.trim()}/oauth/token`;
          const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              grant_type: 'password',
              client_id: formData.clientId.trim(),
              client_secret: cleanedSecret,
              username: formData.username.trim(),
              password: formData.password.trim(),
              scope: '*'
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || 'Invalid credentials or connection failure.');
          }

          const oauthData = await response.json();
          const accessToken = oauthData.access_token;

          // Save retrieved access token
          const finalConfig = {
            ...updatedConfig,
            accessToken: accessToken
          };
          await saveSettingsHelper(finalConfig);

          // Wipe database tables for a fresh account on Mobile/Capacitor
          try {
            await capacitorWipeDb();
          } catch (wipeErr) {
            console.error('Failed to wipe capacitor DB on login:', wipeErr);
          }

          // Retrieve and cache live user details
          setStatus({ type: 'loading', message: 'Fetching user role and profile...' });
          const userRes = await fetch(`${formData.url.trim()}/api/user-details`, {
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
            await saveSettingsHelper(finalConfig);

            // Sync all data into Capacitor SQLite database
            setStatus({ type: 'loading', message: 'Syncing ERP inventory, lots & locations...' });
            try {
              await syncNow();
            } catch (syncErr) {
              console.error('Initial sync failed:', syncErr);
            }

            onLoginSuccess({
              name: erpUser.name,
              role: erpUser.role || 'admin',
              permissions: erpUser.permissions || [],
              email: erpUser.email,
              max_discount: erpUser.max_discount !== undefined ? erpUser.max_discount : null
            });
          } else {
            // Fallback if profile fetch succeeds but metadata fails
            setStatus({ type: 'loading', message: 'Syncing ERP inventory, lots & locations...' });
            try {
              await syncNow();
            } catch (_) {}
            onLoginSuccess({
              name: formData.username,
              role: 'admin',
              permissions: []
            });
          }
        }
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: `Login failed: ${error}` });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 z-[100]">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="p-12">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary/20 rotate-3">
               <Building2 className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">ZIMOZO <span className="text-slate-400">OFFLINE</span></h1>
            <p className="text-slate-500 mt-2 font-medium">Enterprise ERP & POS System</p>
          </div>

          {/* Login Method Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-8">
            <button 
              onClick={() => setLoginMethod('standard')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                loginMethod === 'standard' ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
              )}
            >
              Password
            </button>
            <button 
              onClick={() => setLoginMethod('token')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                loginMethod === 'token' ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
              )}
            >
              API Token
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Server URL</label>
              <div className="relative group">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                <input 
                  type="text" 
                  required
                  placeholder="https://erp.zimozo.lk"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>
            </div>

            {loginMethod === 'token' ? (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">API Personal Token</label>
                <div className="relative group">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                  <input 
                    type="password" 
                    required
                    placeholder="Enter token here..."
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                    value={formData.clientSecret}
                    onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400 px-2">Paste the long token string provided in your ERP settings.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Client ID</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. 16"
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Client Secret</label>
                    <input 
                      type="password" 
                      required
                      placeholder="••••••••"
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.clientSecret}
                      onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                    <input 
                      type="text" 
                      required
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                    <input 
                      type="password" 
                      required
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {status.type === 'error' && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 animate-bounce">
                <ShieldCheck size={18} /> {status.message}
              </div>
            )}

            <button 
              type="submit"
              disabled={status.type === 'loading'}
              className="w-full bg-primary text-primary-foreground py-5 rounded-[1.5rem] font-bold text-lg shadow-2xl shadow-primary/30 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {status.type === 'loading' ? (
                <RefreshCw size={24} className="animate-spin" />
              ) : (
                <>Login to Zimozo <ArrowRight size={24} /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
             <button 
              onClick={() => setMode(mode === 'password' ? 'pin' : 'password')}
              className="text-sm font-bold text-slate-400 hover:text-primary transition-colors"
             >
               Switch to {mode === 'password' ? 'PIN Login' : 'Password Login'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
