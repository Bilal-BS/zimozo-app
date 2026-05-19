import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  Package,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Timer
} from 'lucide-react';
import { db } from '@/services/db';
import { syncNow } from '@/services/syncService';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  from: string;
  to: string;
}

const StatCard = ({ title, value, icon: Icon, trend, from, to }: StatCardProps) => (
  <div className={cn(
    'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg card-hover',
    `bg-gradient-to-br ${from} ${to}`
  )}>
    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
    <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
    <div className="relative">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 bg-white/15 rounded-xl">
          <Icon size={20} />
        </div>
        {trend && (
          <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">{title}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
    </div>
  </div>
);

export default function Dashboard({ user }: { user: any }) {
  const [stats, setStats] = useState({ todaySales: '0.00', customers: 0, products: 0, lowStock: 0 });
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const localDate = new Date().toISOString().split('T')[0];
      const [salesRes, custRes, prodRes, stockRes, recent] = await Promise.all([
        db.getOne('SELECT SUM(total_amount) as total FROM sales WHERE date(created_at, "localtime") = ?', [localDate]),
        db.getOne('SELECT COUNT(*) as count FROM customers'),
        db.getOne('SELECT COUNT(*) as count FROM products'),
        db.getOne('SELECT COUNT(*) as count FROM products WHERE stock_quantity < 5'),
        db.query(`
          SELECT s.*, datetime(s.created_at,'localtime') as local_created_at, c.name as customer_name
          FROM sales s LEFT JOIN customers c ON s.customer_id = c.remote_id
          ORDER BY s.created_at DESC LIMIT 6
        `)
      ]);
      setStats({
        todaySales: Number(salesRes?.total || 0).toFixed(2),
        customers:  Number(custRes?.count  || 0),
        products:   Number(prodRes?.count  || 0),
        lowStock:   Number(stockRes?.count || 0)
      });
      setRecentSales(recent);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  const handleSync = async () => {
    setSyncing(true);
    try { await syncNow(); setLastSync(new Date()); await loadStats(); } catch (_) {}
    setSyncing(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Welcome header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{greeting},</p>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
            {user?.name || 'User'} 👋
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <CheckCircle2 size={12} className="text-emerald-400" />
              Synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-indigo-600/30 disabled:opacity-60 active:scale-95"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <Link to="/pos">
            <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-600/30 active:scale-95">
              New Sale <ArrowRight size={15} />
            </button>
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Sales"  value={`$${stats.todaySales}`} icon={TrendingUp}  trend="+12%" from="from-indigo-600"  to="to-purple-700"  />
        <StatCard title="Customers"      value={stats.customers}        icon={Users}       from="from-sky-500"    to="to-cyan-600"    />
        <StatCard title="Products"       value={stats.products}         icon={Package}     from="from-amber-500"  to="to-orange-600"  />
        <StatCard title="Low Stock"      value={stats.lowStock}         icon={AlertCircle} from="from-rose-500"   to="to-pink-700"    />
      </div>

      {/* ── Recent invoices ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm md:text-base">
            <Clock size={17} className="text-indigo-400" />
            Recent Invoices
          </h3>
          <Link to="/sales" className="text-xs text-indigo-400 font-semibold hover:underline flex items-center gap-1">
            View All <ArrowRight size={12} />
          </Link>
        </div>

        {/* Mobile card list (sm and below) */}
        <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {recentSales.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm italic">No recent sales.</div>
          ) : recentSales.map(sale => (
            <div key={sale.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  #INV-{sale.id.toString().padStart(4, '0')}
                </p>
                <p className="text-xs text-slate-400 truncate">{sale.customer_name || 'Walk-in'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">${Number(sale.total_amount).toFixed(2)}</p>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full',
                  sale.sync_status === 'synced'
                    ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                )}>
                  {sale.sync_status === 'synced' ? 'Synced' : 'Pending'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Invoice #</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400 italic text-sm">
                    No recent sales found.
                  </td>
                </tr>
              ) : recentSales.map(sale => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                    #INV-{sale.id.toString().padStart(4, '0')}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                    {sale.customer_name || 'Walk-in Customer'}
                  </td>
                  <td className="px-5 py-3.5 font-black text-slate-900 dark:text-white">
                    ${Number(sale.total_amount).toFixed(2)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Timer size={11} className="text-slate-400" />
                      {sale.local_created_at
                        ? new Date(sale.local_created_at.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'N/A'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-bold',
                      sale.payment_status === 'paid'
                        ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    )}>
                      {sale.payment_status || 'Paid'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'flex items-center gap-1.5 text-xs font-semibold',
                      sale.sync_status === 'synced' ? 'text-emerald-500' : 'text-amber-500'
                    )}>
                      <div className={cn('w-1.5 h-1.5 rounded-full', sale.sync_status === 'synced' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse')} />
                      {sale.sync_status === 'synced' ? 'Synced' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
