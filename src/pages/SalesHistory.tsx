import { useState, useEffect } from 'react';
import {
  Search,
  Download,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  AlertCircle,
  Package,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  TrendingUp,
  Printer
} from 'lucide-react';
import { db } from '@/services/db';
import { cn } from '@/lib/utils';
import { syncNow } from '@/services/syncService';

export default function SalesHistory() {
  const [activeTab, setActiveTab] = useState<'transactions' | 'items'>('transactions');
  const [sales, setSales] = useState<any[]>([]);
  const [soldItems, setSoldItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleLineItems, setSaleLineItems] = useState<Record<number, any[]>>({});
  const [printReceiptData, setPrintReceiptData] = useState<any>(null);

  useEffect(() => {
    if (activeTab === 'transactions') {
      loadSales();
    } else {
      loadSoldItems();
    }
  }, [activeTab]);

  async function loadSales() {
    setIsLoading(true);
    try {
      const res = await db.query(`
        SELECT s.*, datetime(s.created_at, 'localtime') as local_time, c.name as customer_name, sq.error_log
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.remote_id 
        LEFT JOIN sync_queue sq ON sq.table_name = 'sales' AND sq.record_id = s.id
        ORDER BY s.created_at DESC
      `);
      setSales(res || []);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSaleLineItems(saleId: number) {
    if (saleLineItems[saleId]) return; // already loaded
    try {
      const res = await db.query(`
        SELECT si.*, p.name as product_name, p.sku as product_sku, p.image_url
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.remote_id OR si.product_id = p.id
        WHERE si.sale_id = ?
      `, [saleId]);
      setSaleLineItems(prev => ({ ...prev, [saleId]: res || [] }));
    } catch (err) {
      console.error('Error loading line items:', err);
    }
  }

  function toggleExpand(saleId: number) {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
    } else {
      setExpandedSaleId(saleId);
      loadSaleLineItems(saleId);
    }
  }

  async function handleReturnSale(saleId: number) {
    if (!confirm('Are you sure you want to process a return for this sale? This will mark it as returned and restore product stocks.')) {
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Get sale items to restore product stock
      const items = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);

      // 2. Update each product's stock_quantity locally
      if (items && items.length > 0) {
        for (const item of items) {
          await db.execute(
            `UPDATE products 
             SET stock_quantity = stock_quantity + ? 
             WHERE remote_id = ? OR id = ?`,
            [item.quantity, item.product_id, item.product_id]
          );
        }
      }

      // 3. Mark sale status as returned
      await db.execute('UPDATE sales SET status = "returned", sync_status = "pending" WHERE id = ?', [saleId]);

      // 4. Push to sync queue as a return
      const salesData = await db.query('SELECT * FROM sales WHERE id = ?', [saleId]);
      if (salesData && salesData.length > 0) {
        const sale = salesData[0];
        const cloudPayload = {
          location_id: 1,
          transaction_id: sale.remote_id,
          status: 'returned',
          final_total: sale.total_amount,
          products: items.map((item: any) => ({
            product_id: item.product_id,
            variation_id: item.variation_id || item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        };

        await db.execute(
          'INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)',
          ['sales', saleId, 'CREATE_RETURN', JSON.stringify(cloudPayload)]
        );
      }

      alert('Sale returned successfully! Stocks restored.');
      loadSales();
      setSaleLineItems(prev => { const next = { ...prev }; delete next[saleId]; return next; });

      // Trigger manual sync if available
      if ((window as any).electronAPI?.syncNow) {
        await (window as any).electronAPI.syncNow();
      } else {
        await syncNow();
      }
    } catch (error: any) {
      console.error('Error returning sale:', error);
      alert(`Return failed: ${error?.message || error}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handlePrintSale(sale: any) {
    try {
      const items = await db.query(`
        SELECT si.*, p.name as product_name, p.sku as product_sku
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.remote_id OR si.product_id = p.id
        WHERE si.sale_id = ?
      `, [sale.id]);

      const sub = (items || []).reduce((sum: number, li: any) => sum + Number(li.total || 0), 0);
      
      setPrintReceiptData({
        invoiceNo: `INV-${sale.id.toString().padStart(5, '0')}`,
        date: sale.local_time,
        items: (items || []).map((li: any) => ({
          name: li.product_name || 'Unknown Item',
          quantity: li.quantity,
          price: Number(li.unit_price) + (Number(li.line_discount_amount || 0)),
          customPrice: Number(li.unit_price),
          lineDiscount: li.line_discount_amount,
          lineDiscountType: li.line_discount_type,
          selectedVariation: li.variation_id ? `Var ID: ${li.variation_id}` : '',
          selectedLot: li.lot_number,
          selectedExpiry: li.expiry_date
        })),
        subtotal: sub,
        discount: Number(sale.discount_amount || 0),
        tax: Number(sale.tax_amount || 0),
        shipping: 0,
        total: Number(sale.total_amount),
        paid: sale.payment_status === 'paid' ? Number(sale.total_amount) : 0,
        due: sale.payment_status === 'due' ? Number(sale.total_amount) : (sale.payment_status === 'partial' ? Number(sale.total_amount) * 0.5 : 0),
        customerName: sale.customer_name || 'Walk-In Customer',
        locationName: 'Active Branch'
      });
    } catch (err) {
      console.error('Error preparing print:', err);
      alert('Could not prepare invoice for printing.');
    }
  }

  async function loadSoldItems() {
    setIsLoading(true);
    try {
      const res = await db.query(`
        SELECT 
          si.id,
          si.quantity,
          si.unit_price,
          si.total as line_total,
          s.created_at,
          datetime(s.created_at, 'localtime') as local_time,
          p.name as product_name,
          p.sku as product_sku,
          p.category as product_category
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.remote_id OR si.product_id = p.id
        ORDER BY s.created_at DESC
      `);
      setSoldItems(res || []);
    } catch (error) {
      console.error('Error loading sold items:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const triggerManualSync = async () => {
    setIsSyncing(true);
    try {
      if ((window as any).electronAPI?.syncNow) {
        await (window as any).electronAPI.syncNow();
      } else {
        await syncNow();
      }
      if (activeTab === 'transactions') {
        await loadSales();
      } else {
        await loadSoldItems();
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredSales = sales.filter(s =>
    s.id.toString().includes(searchTerm) ||
    (s.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredItems = soldItems.filter(item =>
    (item.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.product_sku || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary stats
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const syncedCount = sales.filter(s => s.sync_status === 'synced').length;
  const pendingCount = sales.filter(s => s.sync_status === 'pending').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sales & Items History</h1>
          <p className="text-slate-500 dark:text-slate-400">View local/synced sales transactions and individual item sales records.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={triggerManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-600/20 hover:opacity-90 transition-all disabled:opacity-50",
              isSyncing && "animate-pulse"
            )}
          >
            <ArrowUpRight size={18} className={cn(isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={activeTab === 'transactions' ? "Search by Invoice/Customer..." : "Search by Item Name/SKU..."}
              className="pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-64 text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <FileText size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Invoices</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{sales.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Revenue</p>
            <p className="text-xl font-black text-emerald-600">${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Clock size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Synced / Pending</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              <span className="text-emerald-600">{syncedCount}</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className="text-amber-500">{pendingCount}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px">
        <button
          onClick={() => { setActiveTab('transactions'); setSearchTerm(''); }}
          className={cn(
            "pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all outline-none",
            activeTab === 'transactions'
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Sales Transactions
        </button>
        <button
          onClick={() => { setActiveTab('items'); setSearchTerm(''); }}
          className={cn(
            "pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all outline-none",
            activeTab === 'items'
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Sold Items Report
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === 'transactions' ? (
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-4 w-8"></th>
                  <th className="px-4 py-4">Invoice #</th>
                  <th className="px-4 py-4">Date & Time</th>
                  <th className="px-4 py-4">Customer</th>
                  <th className="px-4 py-4">Amount</th>
                  <th className="px-4 py-4">Tax</th>
                  <th className="px-4 py-4">Payment</th>
                  <th className="px-4 py-4">Sync</th>
                  <th className="px-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-slate-400 text-sm font-medium">Loading history...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400 italic">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map(sale => (
                    <>
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        {/* Expand toggle */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(sale.id)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all"
                          >
                            {expandedSaleId === sale.id
                              ? <ChevronDown size={14} />
                              : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-slate-700 dark:text-slate-300">#INV-{sale.id.toString().padStart(5, '0')}</span>
                            {sale.status === 'returned' && (
                              <span className="self-start px-1.5 py-0.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded text-[8px] font-black uppercase tracking-wider">Returned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{new Date(sale.local_time).toLocaleDateString()}</span>
                            <span className="text-xs text-slate-400 font-bold">{new Date(sale.local_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{sale.customer_name || 'Walk-in Customer'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 dark:text-white">${Number(sale.total_amount).toFixed(2)}</span>
                            {Number(sale.discount_amount) > 0 && (
                              <span className="text-[9px] text-red-500 font-bold">-${Number(sale.discount_amount).toFixed(2)} disc</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-slate-500">${Number(sale.tax_amount || 0).toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                            sale.payment_status === 'paid' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {sale.payment_status || 'Paid'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              {sale.sync_status === 'synced' ? (
                                <CheckCircle2 size={14} className="text-green-500" />
                              ) : sale.sync_status === 'failed' ? (
                                <AlertCircle size={14} className="text-red-500" />
                              ) : (
                                <Clock size={14} className="text-amber-500 animate-pulse" />
                              )}
                              <span className={cn(
                                "text-xs font-bold capitalize",
                                sale.sync_status === 'synced' ? "text-green-600" : sale.sync_status === 'failed' ? "text-red-600" : "text-amber-600"
                              )}>
                                {sale.sync_status}
                              </span>
                            </div>
                            {sale.error_log && (
                              <p className="text-[9px] text-red-400 max-w-[120px] truncate" title={sale.error_log}>
                                {sale.error_log}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {sale.status !== 'returned' ? (
                              <button
                                onClick={() => handleReturnSale(sale.id)}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                title="Return Sale"
                              >
                                <RotateCcw size={15} />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold uppercase select-none mr-2">Returned</span>
                            )}
                            <button 
                              onClick={() => handlePrintSale(sale)}
                              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" 
                              title="Print Invoice Receipt"
                            >
                              <Printer size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expandable Line Items Row ── */}
                      {expandedSaleId === sale.id && (
                        <tr key={`${sale.id}-items`}>
                          <td colSpan={9} className="px-4 pb-3 pt-0 bg-slate-50/50 dark:bg-slate-800/20">
                            <div className="ml-8 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                              {!saleLineItems[sale.id] ? (
                                <div className="flex items-center justify-center py-4 gap-2 text-slate-400 text-xs font-bold">
                                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                  Loading items...
                                </div>
                              ) : saleLineItems[sale.id].length === 0 ? (
                                <div className="py-4 text-center text-xs text-slate-400 italic">No line items found.</div>
                              ) : (
                                <table className="w-full text-left">
                                  <thead className="bg-slate-100 dark:bg-slate-700/40 text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                    <tr>
                                      <th className="px-4 py-2">Product</th>
                                      <th className="px-4 py-2">SKU</th>
                                      <th className="px-4 py-2">Qty</th>
                                      <th className="px-4 py-2">Unit Price</th>
                                      <th className="px-4 py-2 text-right">Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                                    {saleLineItems[sale.id].map((li: any) => (
                                      <tr key={li.id} className="text-xs">
                                        <td className="px-4 py-2 flex items-start gap-2">
                                          <div className="w-6 h-6 bg-slate-200 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                                            <Package size={12} className="text-slate-400" />
                                          </div>
                                          <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{li.product_name || 'Unknown Item'}</span>
                                            
                                            {/* Lot, Expiry, Discount & Warranty Badges */}
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {li.lot_number && (
                                                <span className="px-1 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded text-[8px] font-black uppercase tracking-wide">
                                                  Lot: {li.lot_number}
                                                </span>
                                              )}
                                              {li.expiry_date && (
                                                <span className="px-1 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded text-[8px] font-black uppercase tracking-wide">
                                                  Exp: {li.expiry_date}
                                                </span>
                                              )}
                                              {li.line_discount_amount > 0 && (
                                                <span className="px-1 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded text-[8px] font-black uppercase tracking-wide">
                                                  Disc: {li.line_discount_type === 'percentage' ? `${li.line_discount_amount}%` : `$${Number(li.line_discount_amount).toFixed(2)}`}
                                                </span>
                                              )}
                                              {li.warranty_period && li.warranty_period !== 'No Warranty' && (
                                                <span className="px-1 py-0.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded text-[8px] font-black uppercase tracking-wide">
                                                  🛡️ {li.warranty_period}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400 font-mono text-[10px]">{li.product_sku || '—'}</td>
                                        <td className="px-4 py-2 font-black text-indigo-600">{li.quantity}</td>
                                        <td className="px-4 py-2 text-slate-600 font-semibold">${Number(li.unit_price).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right font-black text-slate-900 dark:text-white">${Number(li.total).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Item Name</th>
                  <th className="px-6 py-4">SKU</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Qty Sold</th>
                  <th className="px-6 py-4">Unit Price</th>
                  <th className="px-6 py-4">Total Amount</th>
                  <th className="px-6 py-4 text-right">Sold At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-slate-400 text-sm font-medium">Loading items...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                          <Package size={16} className="text-slate-400" />
                        </div>
                        <span className="font-bold text-slate-950 dark:text-white">{item.product_name || 'Generic Item'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{item.product_sku || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{item.product_category || 'General'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-black text-indigo-600 dark:text-indigo-400">{item.quantity}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 dark:text-slate-400 font-semibold">${Number(item.unit_price).toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-black text-slate-900 dark:text-white">${Number(item.line_total).toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col text-right">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{new Date(item.local_time).toLocaleDateString()}</span>
                          <span className="text-xs text-slate-400 font-bold">{new Date(item.local_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* ========== HISTORICAL RECEIPT / PRINT MODAL ========== */}
      {printReceiptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[250] p-6 overflow-y-auto no-print">
          {/* Custom Print Style Block */}
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              /* Hide all background POS UI */
              body * {
                visibility: hidden !important;
              }
              #printable-receipt-container, #printable-receipt-container * {
                visibility: visible !important;
              }
              #printable-receipt-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 3in !important; /* 80mm standard receipt paper width */
                margin: 0 !important;
                padding: 10px !important;
                background: white !important;
                color: black !important;
                font-family: 'Courier New', Courier, monospace !important;
                font-size: 11px !important;
                line-height: 1.2 !important;
                display: block !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}} />

          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-3xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-500 flex flex-col no-print">
            {/* Modal Screen Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-6 text-white text-center shrink-0">
              <h3 className="text-xl font-black uppercase tracking-widest">Reprint Invoice</h3>
              <p className="text-indigo-200 text-xs mt-1">Transaction History Records</p>
            </div>

            {/* Screen Receipt Preview */}
            <div className="p-8 space-y-6 flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar bg-slate-50 dark:bg-slate-950">
              <div id="screen-receipt-view" className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 text-xs font-mono text-slate-700 dark:text-slate-300">
                <div className="text-center space-y-1">
                  <h4 className="text-base font-black text-slate-900 dark:text-white uppercase">{printReceiptData.locationName}</h4>
                  <p className="text-slate-400">Zimozo Premium POS</p>
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-1">
                  <p className="flex justify-between"><span>Inv No:</span> <strong>{printReceiptData.invoiceNo}</strong></p>
                  <p className="flex justify-between"><span>Date:</span> <span>{printReceiptData.date}</span></p>
                  <p className="flex justify-between"><span>Customer:</span> <span>{printReceiptData.customerName}</span></p>
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-2">
                  <div className="font-bold border-b border-slate-100 pb-1 flex justify-between">
                    <span className="w-1/2">Item</span>
                    <span className="w-1/4 text-center">Qty</span>
                    <span className="w-1/4 text-right">Total</span>
                  </div>
                  {printReceiptData.items.map((item: any, i: number) => {
                    const price = item.customPrice !== undefined ? item.customPrice : item.price;
                    const discount = item.lineDiscount || 0;
                    const finalPrice = price; // already discounted in unit_price query
                    return (
                      <div key={i} className="flex justify-between items-start">
                        <div className="w-1/2 flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                          {item.selectedVariation && (
                            <span className="text-[10px] text-slate-400">Var: {item.selectedVariation}</span>
                          )}
                          {item.selectedLot && (
                            <span className="text-[10px] text-slate-400">Lot: {item.selectedLot}</span>
                          )}
                        </div>
                        <span className="w-1/4 text-center">{item.quantity}</span>
                        <span className="w-1/4 text-right font-bold">${Number(item.total).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-1 pt-2">
                  <p className="flex justify-between text-base font-black text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-800 pt-2">
                    <span>Grand Total:</span>
                    <span>${printReceiptData.total.toFixed(2)}</span>
                  </p>
                  {printReceiptData.discount > 0 && (
                    <p className="flex justify-between text-red-500 font-bold"><span>Discount:</span> <span>-${printReceiptData.discount.toFixed(2)}</span></p>
                  )}
                  {printReceiptData.tax > 0 && (
                    <p className="flex justify-between"><span>Tax:</span> <span>${printReceiptData.tax.toFixed(2)}</span></p>
                  )}
                  {printReceiptData.due > 0 && (
                    <p className="flex justify-between text-red-500 font-black"><span>Outstanding Dues:</span> <span>${printReceiptData.due.toFixed(2)}</span></p>
                  )}
                </div>

                <div className="text-center pt-4 text-[10px] text-slate-400">
                  <p className="font-bold">Thank you for your business!</p>
                  <p>Powered by Zimozo Cloud ERP</p>
                </div>
              </div>
            </div>

            {/* Modal Screen Footer Actions */}
            <div className="p-8 border-t border-slate-200 dark:border-slate-800 flex gap-4 shrink-0">
              <button 
                onClick={async () => {
                  try {
                    const html = document.getElementById('printable-receipt-container')?.innerHTML;
                    if (!html) {
                      window.print();
                      return;
                    }
                    const settings = (window as any).electronAPI ? await (window as any).electronAPI.getSettings() : null;
                    const printer = settings?.receiptPrinter || '';
                    const silent = settings?.silentPrint ?? true;
                    
                    if ((window as any).electronAPI?.printReceipt) {
                      await (window as any).electronAPI.printReceipt(html, printer, silent);
                    } else {
                      window.print();
                    }
                  } catch (e) {
                    console.error('Offscreen print failed, falling back:', e);
                    window.print();
                  }
                }}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
              >
                Print Receipt
              </button>
              <button 
                onClick={() => setPrintReceiptData(null)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black uppercase text-xs tracking-widest transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Hidden 80mm Print Layout solely rendered during printing */}
          <div id="printable-receipt-container" className="hidden">
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', textTransform: 'uppercase' }}>{printReceiptData.locationName}</h3>
              <p style={{ margin: '0 0 5px 0', color: '#666' }}>Zimozo Premium POS Receipt</p>
              <p style={{ margin: '0' }}>--------------------------------</p>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ width: '40%' }}>Invoice No:</td><td style={{ width: '60%', fontWeight: 'bold' }}>{printReceiptData.invoiceNo}</td></tr>
                  <tr><td>Date:</td><td>{printReceiptData.date}</td></tr>
                  <tr><td>Customer:</td><td>{printReceiptData.customerName}</td></tr>
                </tbody>
              </table>
              <p style={{ margin: '5px 0 0 0' }}>--------------------------------</p>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000', fontWeight: 'bold' }}>
                    <th style={{ width: '50%', padding: '2px 0' }}>Item</th>
                    <th style={{ width: '20%', textAlign: 'center', padding: '2px 0' }}>Qty</th>
                    <th style={{ width: '30%', textAlign: 'right', padding: '2px 0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printReceiptData.items.map((item: any, i: number) => {
                    return (
                      <tr key={i} style={{ borderBottom: '1px dashed #ccc' }}>
                        <td style={{ padding: '4px 0' }}>
                          <span style={{ fontWeight: 'bold', display: 'block' }}>{item.name}</span>
                          {item.selectedVariation && <span style={{ fontSize: '9px', color: '#666', display: 'block' }}>Var: {item.selectedVariation}</span>}
                          {item.selectedLot && <span style={{ fontSize: '9px', color: '#666', display: 'block' }}>Lot: {item.selectedLot}</span>}
                        </td>
                        <td style={{ textAlign: 'center', padding: '4px 0' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '4px 0' }}>${Number(item.total).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ margin: '5px 0 0 0' }}>--------------------------------</p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ textAlign: 'left' }}>Subtotal:</td><td>${printReceiptData.subtotal.toFixed(2)}</td></tr>
                  {printReceiptData.discount > 0 && <tr><td style={{ textAlign: 'left', color: 'red' }}>Discount:</td><td>-${printReceiptData.discount.toFixed(2)}</td></tr>}
                  {printReceiptData.tax > 0 && <tr><td style={{ textAlign: 'left' }}>Tax:</td><td>${printReceiptData.tax.toFixed(2)}</td></tr>}
                  <tr style={{ fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid #000' }}>
                    <td style={{ textAlign: 'left', paddingTop: '4px' }}>Grand Total:</td>
                    <td style={{ paddingTop: '4px' }}>${printReceiptData.total.toFixed(2)}</td>
                  </tr>
                  <tr style={{ color: 'green' }}><td style={{ textAlign: 'left' }}>Paid:</td><td>${printReceiptData.paid.toFixed(2)}</td></tr>
                  {printReceiptData.due > 0 && <tr style={{ color: 'red', fontWeight: 'bold' }}><td style={{ textAlign: 'left' }}>Outstanding:</td><td>${printReceiptData.due.toFixed(2)}</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '10px' }}>
              <p style={{ fontWeight: 'bold', margin: '0 0 3px 0' }}>Thank you for your business!</p>
              <p style={{ margin: '0' }}>Powered by Zimozo Cloud ERP</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
