import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Globe,
  ArrowRight,
  ShieldCheck,
  Building2,
  RefreshCw,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';
import { syncNow } from '@/services/syncService';
import { capacitorWipeDb } from '@/services/sqlite';
import { cn } from '@/lib/utils';

const electronAPI = (window as any).electronAPI;

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [config, setConfig]       = useState<any>(null);
  const [loginMethod, setLoginMethod] = useState<'standard' | 'token'>('standard');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    url:          'https://erp.zimozo.lk',
    username:     '',
    password:     '',
    clientId:     '16',
    clientSecret: '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K'
  });
  const [status, setStatus] = useState<{ type: 'error' | 'loading' | null; message: string }>({
    type: null, message: ''
  });

  useEffect(() => { checkConfiguration(); }, []);

  async function checkConfiguration() {
    let settings: any = null;
    if (electronAPI?.getSettings) {
      settings = await electronAPI.getSettings();
    } else {
      try {
        const local = localStorage.getItem('zimozo_api_config');
        settings = local ? JSON.parse(local) : null;
      } catch (_) {}
    }
    if (settings?.baseUrl) {
      setFormData(prev => ({
        ...prev,
        url:          settings.baseUrl,
        clientId:     settings.clientId     || '16',
        clientSecret: settings.clientSecret || '8llo1PEx06F9ToNBcDovbQfRjTYrXOZakddzjF3K'
      }));
      setConfig(settings);
    }
  }

  const saveSettingsHelper = async (settings: any) => {
    if (electronAPI?.saveSettings) {
      await electronAPI.saveSettings(settings);
    }
    // Always persist to localStorage (works on Android/Capacitor)
    try { localStorage.setItem('zimozo_api_config', JSON.stringify(settings)); } catch (_) {}
    setConfig(settings);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Authenticating...' });

    try {
      if (loginMethod === 'token') {
        // ── API Token login ──
        const tokenConfig = {
          ...config,
          baseUrl:     formData.url,
          accessToken: formData.clientSecret
        };
        await saveSettingsHelper(tokenConfig);

        if (electronAPI?.syncNow) {
          setStatus({ type: 'loading', message: 'Syncing ERP data...' });
          try { await electronAPI.syncNow(); } catch (_) {}
        }

        let freshSettings = config;
        if (electronAPI?.getSettings) {
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

      // ── Standard password login ──
      let cleanedSecret = (formData.clientSecret || config?.clientSecret || '').trim();
      const tokenMatch = cleanedSecret.match(/[a-zA-Z0-9]{30,}/);
      if (tokenMatch) cleanedSecret = tokenMatch[0];

      const updatedConfig = {
        ...config,
        baseUrl:      formData.url.trim(),
        clientId:     (formData.clientId || config?.clientId)?.toString().trim(),
        clientSecret: cleanedSecret,
        username:     formData.username.trim(),
        password:     formData.password.trim()
      };
      await saveSettingsHelper(updatedConfig);

      if (electronAPI) {
        // Desktop / Electron path
        if (electronAPI.wipeDb) await electronAPI.wipeDb();
        await electronAPI.authenticate();
        if (electronAPI.syncNow) {
          setStatus({ type: 'loading', message: 'Syncing ERP data & roles...' });
          await electronAPI.syncNow();
        }
        const freshSettings = await electronAPI.getSettings();
        const erpUser = freshSettings?.loggedInUser;
        onLoginSuccess({
          name:         erpUser?.name         || formData.username,
          role:         erpUser?.role         || 'admin',
          permissions:  erpUser?.permissions  || [],
          email:        erpUser?.email        || formData.username,
          max_discount: erpUser?.max_discount !== undefined ? erpUser.max_discount : null
        });
      } else {
        // ── Android / Capacitor direct REST path ──
        setStatus({ type: 'loading', message: 'Connecting to Zimozo Cloud...' });

        const tokenUrl = `${formData.url.trim()}/oauth/token`;
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            grant_type:    'password',
            client_id:     formData.clientId.trim(),
            client_secret: cleanedSecret,
            username:      formData.username.trim(),
            password:      formData.password.trim(),
            scope:         '*'
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || 'Invalid credentials or connection failure.');
        }

        const oauthData   = await response.json();
        const accessToken = oauthData.access_token;

        // Persist token BEFORE any subsequent requests
        const tokenConfig = { ...updatedConfig, accessToken };
        await saveSettingsHelper(tokenConfig);

        // Wipe old account data
        try { await capacitorWipeDb(); } catch (_) {}

        // Fetch user profile
        setStatus({ type: 'loading', message: 'Fetching your profile...' });
        let finalConfig = tokenConfig;

        try {
          const userRes = await fetch(`${formData.url.trim()}/api/user-details`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            const erpUser  = userData?.data || userData;
            finalConfig.loggedInUser = {
              name:        erpUser.name,
              role:        erpUser.role || 'admin',
              permissions: erpUser.permissions || [],
              email:       erpUser.email
            };
            await saveSettingsHelper(finalConfig);
          }
        } catch (_) {}

        // Full data sync
        setStatus({ type: 'loading', message: 'Syncing ERP inventory & data...' });
        try { await syncNow(); } catch (_) {}

        const erpUser = finalConfig.loggedInUser;
        onLoginSuccess({
          name:         erpUser?.name         || formData.username,
          role:         erpUser?.role         || 'admin',
          permissions:  erpUser?.permissions  || [],
          email:        erpUser?.email        || formData.username,
          max_discount: erpUser?.max_discount !== undefined ? erpUser.max_discount : null
        });
      }

    } catch (error: any) {
      setStatus({ type: 'error', message: `Login failed: ${error?.message || error}` });
    }
  };

  const steps = [
    { label: 'Authenticating', active: status.message.includes('Authenticating') },
    { label: 'Connecting',     active: status.message.includes('Connecting') },
    { label: 'Syncing data',   active: status.message.includes('Syncing') },
    { label: 'Ready',          active: false }
  ];

  return (
    /* Full-screen wrapper — forces dark theme on mobile too */
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950 z-[100] overflow-y-auto">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm mx-4 my-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="p-8">

          {/* Logo / brand */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
              <Building2 className="text-white" size={32} />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              ZIMOZO{' '}
              <span className="text-slate-500 font-semibold">OFFLINE</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 font-medium">Enterprise ERP & POS System</p>
          </div>

          {/* Method tabs */}
          <div className="flex bg-slate-800/70 p-1 rounded-2xl mb-6">
            {(['standard', 'token'] as const).map(method => (
              <button
                key={method}
                type="button"
                onClick={() => setLoginMethod(method)}
                className={cn(
                  'flex-1 py-2 text-sm font-bold rounded-xl transition-all',
                  loginMethod === method
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {method === 'standard' ? 'Password' : 'API Token'}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4">

            {/* Server URL */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                Server URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={17} />
                <input
                  type="text"
                  required
                  placeholder="https://erp.zimozo.lk"
                  className="w-full pl-10 pr-4 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                />
              </div>
            </div>

            {loginMethod === 'token' ? (
              /* API Token */
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                  Personal API Token
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={17} />
                  <input
                    type="password"
                    required
                    placeholder="Paste token here..."
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                    value={formData.clientSecret}
                    onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5 ml-1">
                  Paste the long token from your ERP Settings page.
                </p>
              </div>
            ) : (
              <>
                {/* Client ID + Secret */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="16"
                      className="w-full px-4 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                      value={formData.clientId}
                      onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      className="w-full px-4 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                      value={formData.clientSecret}
                      onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={17} />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="your@email.com"
                      className="w-full pl-10 pr-4 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={17} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-3.5 bg-slate-800 text-white placeholder-slate-600 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm font-medium"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Error message */}
            {status.type === 'error' && (
              <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">{status.message}</span>
              </div>
            )}

            {/* Loading progress */}
            {status.type === 'loading' && (
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold mb-2">
                  <RefreshCw size={15} className="animate-spin" />
                  <span>{status.message}</span>
                </div>
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status.type === 'loading'}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base transition-all',
                'bg-gradient-to-r from-indigo-600 to-purple-600',
                'text-white shadow-lg shadow-indigo-600/30',
                'hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/40',
                'active:scale-[0.98]',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
              )}
            >
              {status.type === 'loading' ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <>
                  <Zap size={18} className="text-indigo-200" />
                  Login to Zimozo
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-slate-600 text-xs mt-6">
            Zimozo Offline POS · Enterprise Edition
          </p>
        </div>
      </div>
    </div>
  );
}
