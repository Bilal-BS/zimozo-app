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
  Receipt,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', color: 'text-indigo-400' },
  { icon: ShoppingCart,    label: 'POS',        path: '/pos',       color: 'text-emerald-400' },
  { icon: Package,         label: 'Products',   path: '/products',  color: 'text-amber-400' },
  { icon: Users,           label: 'Customers',  path: '/customers', color: 'text-sky-400' },
  { icon: Truck,           label: 'Suppliers',  path: '/suppliers', color: 'text-violet-400' },
  { icon: Receipt,         label: 'Expenses',   path: '/expenses',  color: 'text-rose-400' },
  { icon: History,         label: 'Sales History', path: '/sales',  color: 'text-teal-400' },
  { icon: RefreshCcw,      label: 'Sync Status',  path: '/sync',    color: 'text-orange-400' },
  { icon: Settings,        label: 'Settings',   path: '/settings',  color: 'text-slate-400' },
];

interface LayoutProps {
  onLogout: () => void;
  user: any;
}

export default function Layout({ onLogout, user }: LayoutProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // default closed on mobile
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();

  // Detect screen size
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On desktop, default sidebar open; on mobile default closed
      setIsSidebarOpen(!mobile);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close sidebar on nav on mobile
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const closeSidebar = () => setIsSidebarOpen(false);
  const toggleSidebar = () => setIsSidebarOpen(v => !v);

  const userInitial = (user?.name || 'U')[0].toUpperCase();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#0d1117]">

      {/* ── Mobile backdrop ── */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          // base
          'fixed md:relative inset-y-0 left-0 z-40 flex flex-col',
          'w-72 shrink-0',
          'bg-slate-900 dark:bg-[#0d1117]',
          'border-r border-slate-800 dark:border-slate-800/60',
          'transition-transform duration-300 ease-in-out',
          // show/hide
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-full',
          // desktop always visible when open
          !isMobile && isSidebarOpen ? 'md:translate-x-0 md:relative' : '',
          !isMobile && !isSidebarOpen ? 'md:-translate-x-full md:w-0 md:border-0' : '',
        )}
        style={{ height: '100dvh' }}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-800/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="text-white font-black text-sm">Z</span>
            </div>
            <div>
              <h1 className="text-white font-black text-base tracking-tight leading-none">ZIMOZO</h1>
              <span className="text-slate-500 text-[10px] font-semibold tracking-widest uppercase">OFFLINE POS</span>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/10 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full" />
                )}
                <item.icon
                  size={19}
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive ? 'text-indigo-400' : item.color + ' opacity-70 group-hover:opacity-100'
                  )}
                />
                <span className={cn(
                  'font-medium text-sm',
                  isActive ? 'text-white' : ''
                )}>
                  {item.label}
                </span>
                {isActive && <ChevronRight size={14} className="ml-auto text-indigo-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-slate-800/70 space-y-2">
          {/* Online status */}
          <div className={cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium',
            isOnline
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400'
          )}>
            <div className={cn(
              'w-2 h-2 rounded-full shrink-0 animate-pulse',
              isOnline ? 'bg-emerald-400' : 'bg-amber-400'
            )} />
            {isOnline ? <Wifi size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
            <span>{isOnline ? 'Cloud Connected' : 'Working Offline'}</span>
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.name || 'User'}</p>
              <p className="text-slate-500 text-[10px] truncate capitalize">{user?.role || 'Staff'}</p>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm font-medium"
          >
            <LogOut size={16} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Header */}
        <header className="h-14 md:h-16 shrink-0 bg-white dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between px-4 md:px-6 backdrop-blur-sm">
          {/* Left: hamburger + page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm md:text-base font-bold text-slate-800 dark:text-white truncate">
              {navItems.find(item => item.path === location.pathname)?.label || 'Zimozo POS'}
            </h2>
          </div>

          {/* Right: status badge + user avatar */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className={cn(
              'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
              isOnline
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}>
              <div className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              )} />
              {isOnline ? 'Online' : 'Offline'}
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              {userInitial}
            </div>
          </div>
        </header>

        {/* Page content */}
        <section className={cn(
          'flex-1 min-h-0',
          location.pathname === '/pos'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto overscroll-contain p-4 md:p-6 lg:p-8'
        )}>
          <Outlet />
        </section>
      </main>
    </div>
  );
}
