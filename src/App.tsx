import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Expenses from './pages/Expenses';
import Sync from './pages/Sync';
import Settings from './pages/Settings';
import Login from './pages/Login';
import SalesHistory from './pages/SalesHistory';

// Placeholder components for other pages
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50">
    <h2 className="text-2xl font-bold">{title}</h2>
    <p>This module is coming soon.</p>
  </div>
);

import { initCapacitorSqlite, capacitorWipeDb } from './services/sqlite';

function App() {
  const [user, setUser] = React.useState<any>(null);
  const [isDbReady, setIsDbReady] = React.useState(false);

  React.useEffect(() => {
    // Ensure root document has dark class applied for consistent branding and styles
    document.documentElement.classList.add('dark');
    initCapacitorSqlite().then(() => setIsDbReady(true));
  }, []);

  const handleLogout = async () => {
    if ((window as any).electronAPI?.wipeDb) {
      await (window as any).electronAPI.wipeDb();
    } else {
      // On mobile / Capacitor, clear all tables on logout to prevent sales history leakage
      try {
        await capacitorWipeDb();
      } catch (err) {
        console.error('Failed to wipe mobile database on logout:', err);
      }
    }
    setUser(null);
  };

  if (!isDbReady) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-bold">Initializing System...</div>;
  }

  if (!user) {
    return <Login onLoginSuccess={(userData) => setUser(userData)} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<Dashboard user={user} />} />
          <Route path="pos" element={<POS user={user} />} />
          <Route path="products" element={<Products />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="sales" element={<SalesHistory />} />
          <Route path="sync" element={<Sync />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
