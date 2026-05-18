import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck,
  History, 
  Settings, 
  RefreshCcw,
  Wifi,
  WifiOff,
  LogOut,
  Menu,
  X,
  Receipt
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ShoppingCart, label: 'POS', path: '/pos' },
  { icon: Package, label: 'Products', path: '/products' },
  { icon: Users, label: 'Customers', path: '/customers' },
  { icon: Truck, label: 'Suppliers', path: '/suppliers' },
  { icon: Receipt, label: 'Expenses', path: '/expenses' },
  { icon: History, label: 'Sales History', path: '/sales' },
  { icon: RefreshCcw, label: 'Sync Status', path: '/sync' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

interface LayoutProps {
  onLogout: () => void;
  user: any;
}

export default function Layout({ onLogout, user }: LayoutProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={cn(
          "h-full overflow-hidden bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col shrink-0",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen ? (
            <h1 className="text-xl font-bold text-primary tracking-tight">ZIMOZO <span className="text-slate-400">OFFLINE</span></h1>
          ) : (
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">Z</span>
            </div>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center px-3 py-2 rounded-lg transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <item.icon className={cn("shrink-0", isSidebarOpen ? "mr-3" : "mx-auto")} size={20} />
                {isSidebarOpen && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className={cn(
            "flex items-center px-3 py-2 rounded-lg text-sm font-medium",
            isOnline ? "text-green-600 bg-green-50 dark:bg-green-950/20" : "text-amber-600 bg-amber-50 dark:bg-amber-950/20"
          )}>
            {isOnline ? <Wifi size={18} className="mr-3 shrink-0" /> : <WifiOff size={18} className="mr-3 shrink-0" />}
            {isSidebarOpen && (isOnline ? "Cloud Connected" : "Working Offline")}
          </div>
          
          <button 
            onClick={onLogout}
            className="w-full flex items-center px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 transition-colors"
          >
            <LogOut className={cn("shrink-0", isSidebarOpen ? "mr-3" : "mx-auto")} size={20} />
            {isSidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {location.pathname !== '/pos' && (
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {navItems.find(item => item.path === location.pathname)?.label || 'Zimozo'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-xs text-slate-500">{user?.role || 'Staff'} - Main Branch</p>
            </div>
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center overflow-hidden border-2 border-primary/20">
               <Users size={20} />
            </div>
          </div>
        </header>
        )}

        <section className={location.pathname === '/pos' ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 overflow-auto p-8'}>
           <Outlet />
        </section>
      </main>
    </div>
  );
}
