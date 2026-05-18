import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  Package, 
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { db } from '@/services/db';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  color: string;
}

const StatCard = ({ title, value, icon: Icon, trend, color }: StatCardProps) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={color.replace('bg-', 'text-')} size={24} />
      </div>
      {trend && (
        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
          {trend}
        </span>
      )}
    </div>
    <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">{title}</h3>
    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
  </div>
);

export default function Dashboard({ user }: { user: any }) {
  const [stats, setStats] = useState({
    todaySales: '0.00',
    customers: 0,
    products: 0,
    lowStock: 0
  });

  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    async function loadStats() {
      try {
        const localDate = new Date().toISOString().split('T')[0];
        const salesRes = await db.getOne('SELECT SUM(total_amount) as total FROM sales WHERE date(created_at, "localtime") = ?', [localDate]);
        const custRes = await db.getOne('SELECT COUNT(*) as count FROM customers');
        const prodRes = await db.getOne('SELECT COUNT(*) as count FROM products');
        const stockRes = await db.getOne('SELECT COUNT(*) as count FROM products WHERE stock_quantity < 5');

        setStats({
          todaySales: Number(salesRes?.total || 0).toFixed(2),
          customers: Number(custRes?.count || 0),
          products: Number(prodRes?.count || 0),
          lowStock: Number(stockRes?.count || 0)
        });

        const recent = await db.query(`
          SELECT s.*, datetime(s.created_at, 'localtime') as local_created_at, c.name as customer_name 
          FROM sales s 
          LEFT JOIN customers c ON s.customer_id = c.remote_id 
          ORDER BY s.created_at DESC LIMIT 5
        `);
        setRecentSales(recent);
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    }

    loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back, {user?.name || 'User'}!</h1>
          <p className="text-slate-500 dark:text-slate-400">Here's what's happening at your branch today.</p>
        </div>
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
          New Sale <ArrowRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Today's Sales" 
          value={`$${stats.todaySales}`} 
          icon={TrendingUp} 
          trend="+12.5%" 
          color="bg-blue-600" 
        />
        <StatCard 
          title="Total Customers" 
          value={stats.customers} 
          icon={Users} 
          color="bg-purple-600" 
        />
        <StatCard 
          title="Total Products" 
          value={stats.products} 
          icon={Package} 
          color="bg-amber-600" 
        />
        <StatCard 
          title="Low Stock Alerts" 
          value={stats.lowStock} 
          icon={AlertCircle} 
          color="bg-red-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock size={20} className="text-slate-400" />
              Recent Invoices
            </h3>
            <button className="text-sm text-primary font-medium hover:underline">View All</button>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No recent sales found.</td>
                  </tr>
                ) : recentSales.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">#INV-{sale.id.toString().padStart(4, '0')}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{sale.customer_name || 'Walk-in Customer'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">${Number(sale.total_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {sale.local_created_at ? new Date(sale.local_created_at.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-xs font-bold",
                        sale.payment_status === 'paid' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {sale.payment_status || 'Paid'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          sale.sync_status === 'synced' ? "bg-green-500" : "bg-amber-500"
                        )}></div>
                        {sale.sync_status === 'synced' ? 'Synced' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-slate-400" />
            Quick Actions
          </h3>
          <div className="space-y-4">
            <button className="w-full p-4 text-left border border-slate-100 dark:border-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all group">
               <p className="font-bold">Sync Data Now</p>
               <p className="text-xs text-slate-500 group-hover:text-primary-foreground/80">Manually trigger a cloud synchronization.</p>
            </button>
            <button className="w-full p-4 text-left border border-slate-100 dark:border-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all group">
               <p className="font-bold">Generate Daily Report</p>
               <p className="text-xs text-slate-500 group-hover:text-primary-foreground/80">Export today's sales to PDF.</p>
            </button>
            <button className="w-full p-4 text-left border border-slate-100 dark:border-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all group">
               <p className="font-bold">Inventory Check</p>
               <p className="text-xs text-slate-500 group-hover:text-primary-foreground/80">Review stock levels and requirements.</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
