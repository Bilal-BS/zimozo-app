import React, { useState, useEffect } from 'react';
import { 
  RefreshCcw, 
  CheckCircle2, 
  XCircle, 
  Clock,
  CloudUpload,
  CloudDownload,
  AlertCircle
} from 'lucide-react';
import { db } from '@/services/db';
import { cn } from '@/lib/utils';
import { syncNow } from '@/services/syncService';

interface SyncItem {
  id: number;
  table_name: string;
  record_id: number;
  action: string;
  status: string;
  created_at: string;
  error_log?: string;
}

export default function Sync() {
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadSyncQueue();
    const interval = setInterval(loadSyncQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadSyncQueue() {
    const res = await db.query('SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT 50');
    setSyncQueue(res);
  }

  const triggerManualSync = async () => {
    setIsSyncing(true);
    try {
      if ((window as any).electronAPI?.syncNow) {
        await (window as any).electronAPI.syncNow();
      } else {
        await syncNow();
      }
      await loadSyncQueue();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingCount = syncQueue.filter(item => item.status === 'pending').length;
  const failedCount = syncQueue.filter(item => item.status === 'failed').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Synchronization Hub</h1>
          <p className="text-slate-500 dark:text-slate-400">Monitor and manage data sync with Zimozo Cloud.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={async () => {
              if ((window as any).electronAPI?.retryFailedSync) {
                const res = await (window as any).electronAPI.retryFailedSync();
                alert(`Reset ${res?.reset || 0} failed record(s) back to pending!`);
                loadSyncQueue();
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 transition-all"
          >
            <RefreshCcw size={20} />
            Retry Failed Syncs
          </button>
          <button 
            onClick={triggerManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50",
              isSyncing && "animate-pulse"
            )}
          >
            <RefreshCcw size={20} className={cn(isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing Now..." : "Sync All Data"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
              <CloudUpload size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Pending Uploads</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-[10%] animate-pulse"></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-lg bg-red-100 text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Failed Items</p>
              <p className="text-2xl font-bold">{failedCount}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Items requiring manual resolution</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-lg bg-green-100 text-green-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Last Successful Sync</p>
              <p className="text-lg font-bold">Just Now</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">All modules up to date</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Clock size={20} className="text-slate-400" />
            Recent Sync History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Module</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {syncQueue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                    No sync logs found. Data is currently up to date.
                  </td>
                </tr>
              ) : (
                syncQueue.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">{item.table_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] uppercase font-black rounded-md">
                        {item.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {item.status === 'synced' ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : item.status === 'failed' ? (
                          <XCircle size={16} className="text-red-500" />
                        ) : (
                          <RefreshCcw size={16} className="text-blue-500 animate-spin" />
                        )}
                        <span className={cn(
                          "text-sm font-bold capitalize",
                          item.status === 'synced' ? "text-green-600" : item.status === 'failed' ? "text-red-600" : "text-blue-600"
                        )}>
                          {item.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(item.created_at + ' UTC').toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                      {item.error_log || 'Record ID: ' + item.record_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
