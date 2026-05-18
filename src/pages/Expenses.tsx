import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Plus, 
  Search, 
  Calendar,
  DollarSign,
  MoreVertical,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { db } from '@/services/db';

interface Expense {
  id: number;
  amount: number;
  note: string;
  date: string;
  sync_status: string;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ amount: '', note: '' });

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    try {
      const res = await db.query('SELECT * FROM expenses ORDER BY date DESC');
      setExpenses(res || []);
    } catch (err) {
      console.error('Error loading expenses:', err);
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount) return;

    try {
      const payload = {
        amount: parseFloat(newExpense.amount),
        note: newExpense.note,
        date: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const res = await db.execute(
        'INSERT INTO expenses (amount, note, date) VALUES (?, ?, ?)',
        [payload.amount, payload.note, payload.date]
      );

      await db.execute(
        'INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)',
        ['expenses', res.lastInsertRowid, 'CREATE', JSON.stringify(payload)]
      );

      setNewExpense({ amount: '', note: '' });
      setIsAddModalOpen(false);
      loadExpenses();
      alert('Expense added and queued for sync!');
    } catch (err) {
      console.error('Error adding expense:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Expense Management</h1>
          <p className="text-slate-500">Track and sync your business spending.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> Record Expense
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-red-100 dark:bg-red-950/30 text-red-600 rounded-xl"><DollarSign size={24} /></div>
                <p className="text-sm font-medium text-slate-500">Total Expenses (MTD)</p>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              ${expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}
            </h3>
         </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Sync Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expenses.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                      No expenses recorded yet.
                   </td>
                </tr>
              ) : expenses.map(expense => (
                <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                       <Calendar size={14} />
                       <span>{new Date(expense.date).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                    {expense.note || 'Uncategorized Expense'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-red-600">-${expense.amount.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       {expense.sync_status === 'synced' ? (
                         <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100 uppercase">
                            <CheckCircle2 size={12} /> Synced
                         </span>
                       ) : (
                         <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100 uppercase">
                            <Clock size={12} /> Pending
                         </span>
                       )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><MoreVertical size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <form onSubmit={handleAddExpense} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-xl">Record New Expense</h3>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400"><X size={24} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                   <label className="block text-sm font-bold text-slate-500 mb-2 uppercase">Amount ($)</label>
                   <input 
                      autoFocus
                      type="number" 
                      step="0.01"
                      required
                      placeholder="0.00"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none text-xl font-bold"
                      value={newExpense.amount}
                      onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                   />
                </div>
                <div>
                   <label className="block text-sm font-bold text-slate-500 mb-2 uppercase">Description / Note</label>
                   <textarea 
                      placeholder="e.g. Electricity bill, Rent, etc."
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary outline-none min-h-[100px]"
                      value={newExpense.note}
                      onChange={e => setNewExpense({...newExpense, note: e.target.value})}
                   />
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                 <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 font-bold text-slate-500">Cancel</button>
                 <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity">Save Expense</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
}

const X = ({ size, className }: { size: number, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
