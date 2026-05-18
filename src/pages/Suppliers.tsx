import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Search, 
  Filter,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  ArrowUpDown
} from 'lucide-react';
import { db } from '@/services/db';

interface Supplier {
  id: number;
  remote_id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    try {
      const res = await db.query('SELECT * FROM suppliers');
      setSuppliers(res || []);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  }

  const filteredSuppliers = suppliers.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.phone || '').includes(searchTerm) ||
    (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Suppliers & Vendors</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your supply chain and contact information.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
            <Truck size={18} /> Add Supplier
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by vendor name or contact..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Contact Details</th>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSuppliers.length === 0 ? (
                <tr>
                   <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                      No suppliers found. Check your sync status.
                   </td>
                </tr>
              ) : filteredSuppliers.map(supplier => (
                <tr key={supplier.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
                        <Truck size={20} />
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{supplier.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                       <Phone size={14} className="text-slate-400" />
                       <span>{supplier.phone || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                       <Mail size={14} className="text-slate-400" />
                       <span className="truncate max-w-[200px]">{supplier.email || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                       <MapPin size={14} className="shrink-0" />
                       <span className="line-clamp-1">{supplier.address || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400">
                      <MoreVertical size={18} />
                    </button>
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
