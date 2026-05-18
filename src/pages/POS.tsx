import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  X,
  Package,
  Grid,
  RefreshCcw,
  Receipt,
  LayoutGrid,
  Trash2,
  User,
  Maximize,
  ChevronDown,
  UserPlus,
  CheckCircle2
} from 'lucide-react';
import { db } from '@/services/db';
import { cn } from '@/lib/utils';
import { syncNow } from '@/services/syncService';

const electronAPI = (window as any).electronAPI;

interface Product {
  id: number;
  remote_id: number;
  variation_id: number;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  stock_quantity: number;
  category: string;
  image_url?: string;
  type?: string;
  variations_json?: string;
  enable_expiry?: number;
  enable_sr_no?: number;
  location_stocks_json?: string;
}

interface CartItem extends Product {
  quantity: number;
  selectedVariation?: string;
  selectedVariationId?: number;
  selectedLot?: string;
  selectedExpiry?: string;
  customPrice?: number;
  lineDiscount?: number;
  lineDiscountType?: 'fixed' | 'percentage';
  selectedWarranty?: string;
  lotStockLimit?: number;
}

export default function POS({ user }: { user?: any }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'products' | 'cart'>('products');
  const [receiptData, setReceiptData] = useState<any>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [currentRegister, setCurrentRegister] = useState<any>(null);
  const [isOpenRegisterModalOpen, setIsOpenRegisterModalOpen] = useState(false);
  const [isCloseRegisterModalOpen, setIsCloseRegisterModalOpen] = useState(false);
  const [isFullScreenUI, setIsFullScreenUI] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isOpeningRegister, setIsOpeningRegister] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Multi-Payment State
  const [payments, setPayments] = useState<{ method: string, amount: number }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ name: string, label: string }[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [shippingCharges, setShippingCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'fixed' | 'percentage'>('fixed');

  // Expiry / Lot / Variation Option selection modal state
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [availableVars, setAvailableVars] = useState<any[]>([]);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [availableExpiries, setAvailableExpiries] = useState<{ expiry_date: string, qty_remaining: number }[]>([]);
  const [selectedVarOption, setSelectedVarOption] = useState('');
  const [selectedLotOption, setSelectedLotOption] = useState('');
  const [selectedExpiryOption, setSelectedExpiryOption] = useState('');
  const [optionCustomPrice, setOptionCustomPrice] = useState<number | ''>('');
  const [optionDiscount, setOptionDiscount] = useState<number>(0);
  const [optionDiscountType, setOptionDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [erpSettings, setErpSettings] = useState<any>(null);
  const [editingCartItemId, setEditingCartItemId] = useState<number | null>(null);
  const [optionWarranty, setOptionWarranty] = useState<string>('No Warranty');

  useEffect(() => {
    loadData();
    checkRegister();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function checkRegister() {
    try {
      // Assuming db.query returns array, we take first or use a getOne if available
      const regs = await db.query('SELECT * FROM cash_registers WHERE status = "open" LIMIT 1');
      if (regs && regs.length > 0) {
        setIsRegisterOpen(true);
        setCurrentRegister(regs[0]);
      } else {
        setIsRegisterOpen(false);
        setIsOpenRegisterModalOpen(true);
      }
    } catch (err) {
      console.error('Error checking register:', err);
    }
  }

  useEffect(() => {
    if (isCheckoutOpen) {
        setPayments([{ method: 'cash', amount: total }]);
    }
  }, [isCheckoutOpen]);

  async function handleOpenRegister() {
    setIsOpeningRegister(true);
    setRegisterError('');
    try {
      // Close any lingering open registers first
      await db.execute('UPDATE cash_registers SET status = "closed", closed_at = CURRENT_TIMESTAMP WHERE status = "open"');
      
      const result = await db.execute(
        'INSERT INTO cash_registers (user_id, location_id, status, opening_amount, cash_in_hand, opened_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [1, selectedLocation?.remote_id || 1, 'open', openingBalance, openingBalance]
      );
      
      const newReg = {
        id: result.id,
        status: 'open',
        opening_amount: openingBalance,
        cash_in_hand: openingBalance,
        opened_at: new Date().toISOString()
      };
      setIsRegisterOpen(true);
      setCurrentRegister(newReg);
      setIsOpenRegisterModalOpen(false);
      setOpeningBalance(0);
    } catch (err: any) {
      console.error('Error opening register:', err);
      setRegisterError(String(err?.message || err || 'Failed to open register. Please restart the app.'));
    } finally {
      setIsOpeningRegister(false);
    }
  }

  async function handleCloseRegister() {
    try {
      await db.execute(
        'UPDATE cash_registers SET status = "closed", closed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [currentRegister.id]
      );
      setIsRegisterOpen(false);
      setCurrentRegister(null);
      setIsCloseRegisterModalOpen(false);
      setIsOpenRegisterModalOpen(true); // Prompt to open again
    } catch (err) {
      console.error('Error closing register:', err);
    }
  }

  async function loadData() {
    setIsLoading(true);
    try {
      let settings: any = null;
      if ((window as any).electronAPI) {
        settings = await (window as any).electronAPI.getSettings();
      } else {
        const local = localStorage.getItem('zimozo_api_config');
        settings = local ? JSON.parse(local) : null;
      }
      if (settings?.businessDetails) {
        setErpSettings(settings.businessDetails);
      }
      await loadProducts();
      const activeLoc = await loadLocations();
      await loadCustomers();
      await loadDefaultContact();
      await loadTaxRates(settings?.businessDetails);
      loadPaymentMethods(settings?.businessDetails, activeLoc);
    } finally {
      setIsLoading(false);
    }
  }

  const handleLiveSync = async () => {
    setIsCloudSyncing(true);
    try {
      if ((window as any).electronAPI?.syncNow) {
        await (window as any).electronAPI.syncNow();
      } else {
        await syncNow();
      }
      await loadData();
      alert("✨ Cloud ERP sync complete! All products, variations, locations, taxes, and customer balances are up to date.");
    } catch (e) {
      console.error('Manual sync failed:', e);
      alert("❌ Sync failed. Please check internet connection.");
    } finally {
      setIsCloudSyncing(false);
    }
  };

  function loadPaymentMethods(bizDetails?: any, location?: any) {
    try {
      let finalMethods: { name: string, label: string }[] = [];
      
      if (location && location.settings_json) {
        try {
          const locSettings = JSON.parse(location.settings_json);
          if (locSettings.payment_methods && Array.isArray(locSettings.payment_methods)) {
             // Parse default_payment_accounts if present to check is_enabled flag
             let accountsMap: Record<string, { is_enabled?: string | number }> = {};
             if (locSettings.default_payment_accounts) {
               try {
                 accountsMap = typeof locSettings.default_payment_accounts === 'string'
                   ? JSON.parse(locSettings.default_payment_accounts)
                   : locSettings.default_payment_accounts;
               } catch (e) {
                 console.error('Error parsing default_payment_accounts:', e);
               }
             }

             locSettings.payment_methods.forEach((m: any) => {
               // Check if explicitly disabled in ERP location settings
               if (accountsMap[m.name] && String(accountsMap[m.name].is_enabled) === '0') {
                 return; // Skip disabled payment method
               }
               
               let emoji = '✨';
               if (m.name === 'cash') emoji = '💵';
               else if (m.name === 'card') emoji = '💳';
               else if (m.name === 'bank_transfer') emoji = '🏦';
               else if (m.name === 'cheque') emoji = '✍️';
               else if (m.name === 'other') emoji = '⚙️';
               
               finalMethods.push({
                 name: m.name,
                 label: `${emoji} ${m.label || m.name}`
               });
             });
          }
        } catch (e) {
          console.error('Error parsing settings_json for payment methods:', e);
        }
      }

      // Fallback if finalMethods is empty
      if (finalMethods.length === 0) {
        const coreMap: Record<string, string> = {
          cash: '💵 Cash',
          card: '💳 Card',
          bank_transfer: '🏦 Bank Transfer',
          cheque: '✍️ Cheque',
          other: '⚙️ Other'
        };
        Object.entries(coreMap).forEach(([name, label]) => finalMethods.push({ name, label }));
      }

      setPaymentMethods(finalMethods);

      // Auto-seed the first payment row with the first method
      if (finalMethods.length > 0) {
        setPayments([{ method: finalMethods[0].name, amount: 0 }]);
      }
    } catch (e) {
      // Fallback: basic cash only if ERP data missing
      setPaymentMethods([{ name: 'cash', label: '💵 Cash' }]);
      setPayments([{ method: 'cash', amount: 0 }]);
    }
  }

  async function loadTaxRates(bizDetails?: any) {
    try {
      const defaultTaxId = bizDetails?.default_sales_tax;
      const taxes = await db.query('SELECT * FROM tax_rates');
      setTaxRates(taxes || []);
      if (taxes && taxes.length > 0) {
        const defaultTax = defaultTaxId ? taxes.find((t: any) => t.remote_id === defaultTaxId) : null;
        if (defaultTax) {
          setTaxRate(defaultTax.amount / 100);
        } else {
          setTaxRate(taxes[0].amount / 100);
        }
      }
    } catch (err) {
      console.error('Error loading tax rates:', err);
    }
  }

  async function loadProducts() {
    try {
      const prodList = await db.query('SELECT * FROM products');
      setProducts(prodList || []);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  async function loadLocations() {
    try {
      const res = await db.query('SELECT * FROM business_locations');
      const locList = res || [];
      setLocations(locList);
      
      let settings: any = null;
      if ((window as any).electronAPI) {
        settings = await (window as any).electronAPI.getSettings();
      } else {
        const local = localStorage.getItem('zimozo_api_config');
        settings = local ? JSON.parse(local) : null;
      }
      const savedLoc = settings?.activeLocation;
      if (savedLoc && locList.some((l: any) => l.remote_id === savedLoc.remote_id)) {
        const freshLoc = locList.find((l: any) => l.remote_id === savedLoc.remote_id);
        setSelectedLocation(freshLoc);
        return freshLoc;
      } else if (locList.length > 0) {
        setSelectedLocation(locList[0]);
        return locList[0];
      }
      return null;
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  }

  async function loadDefaultContact() {
    try {
      const contacts = await db.query("SELECT * FROM customers WHERE name LIKE '%Walk-In%' OR name LIKE '%Walk-in%' LIMIT 1");
      if (contacts && contacts.length > 0) {
        setSelectedContact(contacts[0]);
      } else {
        const allCusts = await db.query("SELECT * FROM customers LIMIT 1");
        if (allCusts && allCusts.length > 0) {
          setSelectedContact(allCusts[0]);
        }
      }
    } catch (err) {
      console.error('Error loading default contact:', err);
    }
  }

  async function loadCustomers() {
    try {
      const res = await db.query('SELECT * FROM customers ORDER BY name ASC');
      setCustomers(res || []);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  }

  async function handleAddCustomer() {
    if (!newCustomer.name.trim()) {
      alert('Customer Name is required!');
      return;
    }

    try {
      const result = await db.execute(
        'INSERT INTO customers (name, phone, email, address, sync_status) VALUES (?, ?, ?, ?, ?)',
        [newCustomer.name.trim(), newCustomer.phone.trim(), newCustomer.email.trim(), newCustomer.address.trim(), 'pending']
      );

      const newCustId = result.id;
      const syncPayload = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        address: newCustomer.address.trim()
      };

      // Push to sync queue
      await db.execute(
        'INSERT INTO sync_queue (table_name, record_id, action, payload, status) VALUES (?, ?, ?, ?, ?)',
        ['customers', newCustId, 'CREATE', JSON.stringify(syncPayload), 'pending']
      );

      await loadCustomers();
      
      const createdCustomer = {
        id: newCustId,
        remote_id: null,
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        address: newCustomer.address.trim(),
        sync_status: 'pending'
      };

      setSelectedContact(createdCustomer);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      setIsAddCustomerModalOpen(false);
      
      alert('Customer added successfully! They will sync with your Cloud ERP in the background.');
    } catch (err) {
      console.error('Error adding customer:', err);
      alert('Failed to add customer.');
    }
  }

  const filteredCustomers = customers.filter(c => 
    (c.name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  // ── Step 1: filter by location only ──────────────────────────────────
  // A product strictly belongs to a location if the ERP assigned it to that location.
  // We check assigned_locations_json which contains an array of location IDs.
  const isProductInLocation = (p: any): boolean => {
    if (!selectedLocation?.remote_id) return true; // no location selected → show all
    try {
      // Check ERP explicit location assignments (exact match)
      let assignedIds: any[] = [];
      if (p.assigned_locations_json) {
        assignedIds = JSON.parse(p.assigned_locations_json) || [];
      }
      if (Array.isArray(assignedIds) && assignedIds.length > 0) {
        return assignedIds.includes(selectedLocation.remote_id) || 
               assignedIds.includes(String(selectedLocation.remote_id)) ||
               assignedIds.includes(Number(selectedLocation.remote_id));
      }
      
      return false;
    } catch {
      return false; // parse error → hide it to prevent showing fake data
    }
  };

  const locationProducts = (products || []).filter(isProductInLocation);

  // ── Step 2: derive reactive category list from the location's products ─
  const locationCategories = ['All', ...Array.from(
    new Set(locationProducts.map((p: any) => p.category || 'General'))
  )] as string[];

  // ── Step 3: apply search + category on top ────────────────────────────
  const filteredProducts = locationProducts.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.sku  || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !activeCategory || activeCategory.toLowerCase() === 'all' ||
                           (p.category || 'General').toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const getProductStock = (product: Product) => {
    if (!selectedLocation) return product.stock_quantity;
    try {
      const locStocks = JSON.parse(product.location_stocks_json || '{}');
      const locId = selectedLocation.remote_id;
      return locStocks[locId] !== undefined ? Number(locStocks[locId]) : 0;
    } catch (e) {
      return product.stock_quantity;
    }
  };

  const handleLocationChange = async (loc: any) => {
    setSelectedLocation(loc);
    if (erpSettings) {
      loadPaymentMethods(erpSettings, loc);
    }
    try {
      let settings: any = {};
      if ((window as any).electronAPI) {
        settings = await (window as any).electronAPI.getSettings();
        settings.activeLocation = loc;
        await (window as any).electronAPI.saveSettings(settings);
      } else {
        const local = localStorage.getItem('zimozo_api_config');
        settings = local ? JSON.parse(local) : {};
        settings.activeLocation = loc;
        localStorage.setItem('zimozo_api_config', JSON.stringify(settings));
      }
    } catch (e) {
      console.error('Failed to save active location:', e);
    }
  };

  const addToCart = (product: Product, options?: { variation: string, variationId?: number, lot: string, expiry: string, customPrice?: number, lineDiscount?: number, lineDiscountType?: 'fixed' | 'percentage', lotStockLimit?: number }) => {
    const allowOverselling = erpSettings?.pos_settings?.allow_overselling == 1;
    const currentStock = options?.lotStockLimit !== undefined ? options.lotStockLimit : getProductStock(product);
    
    const suffix = options && options.variation && options.variation !== 'Standard' ? ` (${options.variation})` : '';
    const cartProduct = {
      ...product,
      name: `${product.name}${suffix}`,
      selectedVariation: options?.variation || '',
      selectedVariationId: options?.variationId,
      selectedLot: options?.lot || '',
      selectedExpiry: options?.expiry || '',
      customPrice: options?.customPrice,
      lineDiscount: options?.lineDiscount,
      lineDiscountType: options?.lineDiscountType || 'fixed',
      lotStockLimit: options?.lotStockLimit
    };

    setCart(prev => {
      const existingQty = prev.find(item => 
        item.id === cartProduct.id && 
        (item as any).selectedVariation === cartProduct.selectedVariation && 
        (item as any).selectedLot === cartProduct.selectedLot
      )?.quantity || 0;

      if (!allowOverselling && existingQty + 1 > currentStock) {
        alert("Out of Stock! Overselling is disabled in your ERP settings.");
        return prev;
      }

      if (existingQty > 0) {
        return prev.map(item => 
          (item.id === cartProduct.id && (item as any).selectedVariation === cartProduct.selectedVariation && (item as any).selectedLot === cartProduct.selectedLot)
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...cartProduct, quantity: 1 }];
    });
  };

  const handleProductClick = async (product: Product) => {
    let realVars = [];
    try {
      if ((product as any).variations_json) {
        realVars = JSON.parse((product as any).variations_json) || [];
      }
    } catch (e) {
      console.error('Error parsing variations:', e);
    }

    // Query REAL lots / expiry from SQLite first
    let realLots: any[] = [];
    let realExpiries: { expiry_date: string, qty_remaining: number }[] = [];
    try {
      const locFilter = selectedLocation?.remote_id;
      const lotRows = await db.query(
        `SELECT * FROM product_lots 
         WHERE remote_product_id = ? 
         ${locFilter ? 'AND (location_id IS NULL OR location_id = ?)' : ''}
         ORDER BY expiry_date ASC`,
        locFilter ? [product.remote_id, locFilter] : [product.remote_id]
      );
      if (lotRows && lotRows.length > 0) {
        realLots = lotRows.filter((r: any) => r.lot_number);
        
        // Calculate available stock for each expiry date
        const expiryMap = new Map<string, number>();
        lotRows.forEach((r: any) => {
          if (r.expiry_date) {
            const currentQty = expiryMap.get(r.expiry_date) || 0;
            expiryMap.set(r.expiry_date, currentQty + parseFloat(r.qty_remaining || 0));
          }
        });
        realExpiries = Array.from(expiryMap.entries()).map(([expiry_date, qty_remaining]) => ({
          expiry_date,
          qty_remaining
        }));
      }
    } catch (e) {
      console.error('Error loading lots from DB:', e);
    }

    const hasExpiry = (product as any).enable_expiry === 1 || realExpiries.length > 0;
    const hasLot = (product as any).enable_sr_no === 1 || realLots.length > 0;

    if (realVars.length > 0 || hasExpiry || hasLot) {
      setOptionProduct(product);
      setAvailableVars(realVars);
      setAvailableLots(realLots);
      setAvailableExpiries(realExpiries);
      setSelectedVarOption(realVars.length > 0 ? realVars[0].name : '');
      setSelectedLotOption(realLots.length > 0 ? realLots[0].lot_number : '');
      setSelectedExpiryOption(realExpiries.length > 0 ? realExpiries[0].expiry_date : '');
      setOptionCustomPrice(product.price);
      setOptionDiscount(0);
      setOptionDiscountType('fixed');
      setOptionWarranty('No Warranty');
      setEditingCartItemId(null); // NULL = BEFORE popup
    } else {
      addToCart(product);
    }
  };

  const handleCartItemClick = (item: any) => {
    // Show price, discount & warranty popup AFTER order pad item is clicked!
    setOptionProduct(item);
    setOptionCustomPrice(item.customPrice !== undefined ? item.customPrice : item.price);
    setOptionDiscount(item.lineDiscount || 0);
    setOptionDiscountType(item.lineDiscountType || 'fixed');
    setOptionWarranty(item.selectedWarranty || 'No Warranty');
    setEditingCartItemId(item.id);
  };

  const handleConfirmProductOptions = () => {
    if (!optionProduct) return;

    if (editingCartItemId !== null) {
      // Enforce Minimum Selling Price rule
      const canEditPrice = erpSettings?.pos_settings?.is_pos_subtotal_editable == 1;
      const customP = optionCustomPrice !== '' ? Number(optionCustomPrice) : undefined;
      if (!canEditPrice && customP !== undefined && customP < optionProduct.price) {
        alert(`Minimum selling price restriction! You cannot sell below $${optionProduct.price.toFixed(2)}.`);
        return;
      }

      // Enforce Max Discount rule
      const maxDiscountPct = user?.max_discount;
      let finalDiscount = Number(optionDiscount);
      if (maxDiscountPct !== null && maxDiscountPct !== undefined) {
        const itemPrice = customP !== undefined ? customP : optionProduct.price;
        const discountAsPercent = optionDiscountType === 'percentage' ? finalDiscount : (finalDiscount / itemPrice) * 100;
        
        if (discountAsPercent > maxDiscountPct) {
          alert(`Discount limit exceeded! Your role allows a maximum discount of ${maxDiscountPct}%.`);
          finalDiscount = optionDiscountType === 'percentage' ? maxDiscountPct : itemPrice * (maxDiscountPct / 100);
        }
      }

      // Editing existing cart item! (Price, Discount & Warranty)
      setCart(prev => prev.map(item => {
        if (item.id === editingCartItemId) {
          return {
            ...item,
            customPrice: customP,
            lineDiscount: finalDiscount,
            lineDiscountType: optionDiscountType,
            selectedWarranty: optionWarranty
          };
        }
        return item;
      }));
      setEditingCartItemId(null);
    } else {
      // Adding new (Variation, Lot, Expiry)
      const selectedVar = availableVars.find(v => v.name === selectedVarOption);
      const variationId = selectedVar ? selectedVar.id : undefined;
      
      // Calculate specific stock limit for selected Lot or Expiry
      let lotStockLimit: number | undefined = undefined;
      
      if ((optionProduct as any).enable_sr_no === 1 && selectedLotOption) {
        const matchedLot = availableLots.find(l => l.lot_number === selectedLotOption);
        if (matchedLot) {
          lotStockLimit = parseFloat(String(matchedLot.qty_remaining || 0));
        }
      } else if ((optionProduct as any).enable_expiry === 1 && selectedExpiryOption) {
        const matchedExpiry = availableExpiries.find(e => e.expiry_date === selectedExpiryOption);
        if (matchedExpiry) {
          lotStockLimit = parseFloat(String(matchedExpiry.qty_remaining || 0));
        }
      }

      addToCart(optionProduct, {
        variation: selectedVarOption,
        variationId: variationId,
        lot: selectedLotOption,
        expiry: selectedExpiryOption,
        customPrice: undefined,
        lineDiscount: 0,
        lineDiscountType: 'fixed',
        lotStockLimit: lotStockLimit
      });
    }
    setOptionProduct(null);
  };

  const updateQuantity = (id: number, delta: number) => {
    const allowOverselling = erpSettings?.pos_settings?.allow_overselling == 1;

    setCart(prev => {
      let preventUpdate = false;
      const updatedCart = prev.map(item => {
        if (item.id === id) {
          const newQty = Math.max(0, item.quantity + delta);
          const currentStock = item.lotStockLimit !== undefined ? item.lotStockLimit : getProductStock(item);
          if (!allowOverselling && newQty > currentStock && delta > 0) {
            preventUpdate = true;
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item.quantity > 0);
      
      if (preventUpdate) {
        alert("Out of Stock! Overselling is disabled in your ERP settings.");
        return prev;
      }
      return updatedCart;
    });
  };

  const updateCartItemValue = (id: number, key: string, value: any) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, [key]: value } : item));
  };

  const getCalculatedItemDiscount = (item: CartItem) => {
    const price = item.customPrice !== undefined ? item.customPrice : item.price;
    return item.lineDiscountType === 'percentage' 
      ? price * ((item.lineDiscount || 0) / 100)
      : (item.lineDiscount || 0);
  };

  const subtotal = (cart || []).reduce((sum, item) => sum + (((item.customPrice !== undefined ? item.customPrice : item.price) - getCalculatedItemDiscount(item)) * (item.quantity || 0)), 0);
  
  const calculatedGlobalDiscount = globalDiscountType === 'percentage'
    ? subtotal * (discountAmount / 100)
    : discountAmount;

  const tax = (subtotal - calculatedGlobalDiscount) * taxRate; 
  const total = subtotal - calculatedGlobalDiscount + tax + Number(shippingCharges);

  const handleGlobalDiscountChange = (val: number, type: 'fixed' | 'percentage') => {
    const maxDiscountPct = user?.max_discount;
    if (maxDiscountPct !== null && maxDiscountPct !== undefined) {
      const discountAsPct = type === 'percentage' ? val : (val / subtotal) * 100;
      if (discountAsPct > maxDiscountPct) {
        alert(`Global discount limit exceeded! Your role allows a maximum discount of ${maxDiscountPct}%.`);
        setDiscountAmount(type === 'percentage' ? maxDiscountPct : subtotal * (maxDiscountPct / 100));
        setGlobalDiscountType(type);
        return;
      }
    }
    setDiscountAmount(val);
    setGlobalDiscountType(type);
  };

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remainingToPay = total - totalPaid;

  const handleAddPayment = () => {
    setPayments([...payments, { method: 'cash', amount: 0 }]);
  };

  const handleUpdatePayment = (index: number, field: string, value: any) => {
    const newPayments = [...payments];
    newPayments[index] = { ...newPayments[index], [field]: value };
    setPayments(newPayments);
  };

  const getLocalDateTime = () => {
    const now = new Date();
    return now.getFullYear() + '-' + 
           String(now.getMonth() + 1).padStart(2, '0') + '-' + 
           String(now.getDate()).padStart(2, '0') + ' ' + 
           String(now.getHours()).padStart(2, '0') + ':' + 
           String(now.getMinutes()).padStart(2, '0') + ':' + 
           String(now.getSeconds()).padStart(2, '0');
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    
    const isWalkIn = selectedContact?.name?.toLowerCase().includes('walk-in') || selectedContact?.name?.toLowerCase().includes('walk in');
    if (remainingToPay > 0.01 && isWalkIn) {
      alert('Credit sales are not allowed for Walk-In Customer. Please select or add a registered customer.');
      return;
    }

    const paymentStatus = remainingToPay <= 0.01 ? 'paid' : (totalPaid === 0 ? 'due' : 'partial');

    try {
      // 1. Save sale locally
      const saleResult = await db.execute(
        'INSERT INTO sales (total_amount, tax_amount, discount_amount, payment_method, payment_status, customer_id) VALUES (?, ?, ?, ?, ?, ?)',
        [total, tax, calculatedGlobalDiscount, payments[0]?.method || 'cash', paymentStatus, selectedContact?.remote_id || null]
      );
      const saleId = saleResult.id;

      // 2. Save individual sale items with lots, expiries and discounts
      for (const item of cart) {
        const itemPrice = item.customPrice !== undefined ? item.customPrice : item.price;
        const itemDiscount = getCalculatedItemDiscount(item);
        const finalPrice = itemPrice - itemDiscount;
        const itemTotal = finalPrice * item.quantity;
        await db.execute(
          'INSERT INTO sale_items (sale_id, product_id, variation_id, quantity, unit_price, total, lot_number, expiry_date, line_discount_amount, line_discount_type, warranty_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [saleId, item.remote_id || item.id, (item as any).selectedVariationId || item.variation_id || 0, item.quantity, finalPrice, itemTotal, (item as any).selectedLot || null, (item as any).selectedExpiry || null, item.lineDiscount || 0, item.lineDiscountType || 'fixed', item.selectedWarranty || 'No Warranty']
        );
      }

      // 3. Update register totals
      if (currentRegister?.id) {
        const cashSaleAmount = payments.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
        const cardSaleAmount = payments.filter(p => p.method === 'card').reduce((s, p) => s + Number(p.amount), 0);
        await db.execute(
          'UPDATE cash_registers SET total_cash_sales = total_cash_sales + ?, total_card_sales = total_card_sales + ?, cash_in_hand = cash_in_hand + ? WHERE id = ?',
          [cashSaleAmount, cardSaleAmount, cashSaleAmount, currentRegister.id]
        );
        setCurrentRegister((prev: any) => prev ? { ...prev, cash_in_hand: (prev.cash_in_hand || 0) + cashSaleAmount } : prev);
      }

      // 3b. Update customer credit balance offline if this is a credit sale
      if (remainingToPay > 0.01 && selectedContact?.id) {
        await db.execute(
          'UPDATE customers SET balance = balance + ? WHERE id = ?',
          [remainingToPay, selectedContact.id]
        );
        setSelectedContact((prev: any) => prev ? { ...prev, balance: (prev.balance || 0) + remainingToPay } : prev);
      }

      // 4. Build ERP sell payload — Zimozo/WPOS format
      const cloudPayload = {
        location_id: selectedLocation?.remote_id || 1,
        contact_id: selectedContact?.remote_id || null,
        status: 'final',
        payment_status: paymentStatus,
        transaction_date: getLocalDateTime(),
        final_total: total,
        discount_amount: discountAmount > 0 ? discountAmount : undefined,
        discount_type: discountAmount > 0 ? globalDiscountType : undefined,
        shipping_charges: shippingCharges > 0 ? shippingCharges : undefined,
        tax_rate_id: (() => {
          const matched = taxRates.find(tr => Math.abs((tr.amount / 100) - taxRate) < 0.0001);
          return matched ? matched.remote_id : null;
        })(),
        products: cart.map(item => ({
          product_id: item.remote_id,
          variation_id: (item as any).selectedVariationId || item.variation_id || item.remote_id,
          quantity: item.quantity,
          unit_price: item.customPrice !== undefined ? item.customPrice : item.price,
          line_discount_amount: item.lineDiscount || 0,
          line_discount_type: item.lineDiscountType || 'fixed',
          lot_no: (item as any).selectedLot || null,
          exp_date: (item as any).selectedExpiry || null,
          tax_id: null
        })),
        payments: payments.filter(p => Number(p.amount) > 0).length > 0
          ? payments.filter(p => Number(p.amount) > 0).map(p => ({
              amount: p.amount,
              method: p.method,
              note: 'POS Sale'
            }))
          : [{ amount: 0, method: 'cash', note: 'POS Credit Sale' }]
      };

      // 5. Push to sync queue
      await db.execute(
        'INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)',
        ['sales', saleId, 'CREATE', JSON.stringify(cloudPayload)]
      );

      // 6. Generate invoice receipt number & details before resetting cart
      const receiptInvNo = `INV-${selectedLocation?.remote_id || 1}-${String(Date.now()).slice(-6)}`;
      setReceiptData({
        invoiceNo: receiptInvNo,
        date: getLocalDateTime(),
        items: [...cart],
        subtotal: subtotal,
        discount: calculatedGlobalDiscount,
        tax: tax,
        shipping: shippingCharges,
        total: total,
        paid: totalPaid,
        due: Math.max(0, remainingToPay),
        customerName: selectedContact?.name || 'Walk-In Customer',
        locationName: selectedLocation?.name || 'Main Branch'
      });
      setIsReceiptOpen(true);
      setIsCheckoutOpen(false);

      // 7. Trigger immediate sync in background
      try {
        if ((window as any).electronAPI?.syncNow) {
          (window as any).electronAPI.syncNow();
        } else {
          syncNow();
        }
      } catch (syncErr) {
        console.error('Immediate sync failed:', syncErr);
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert(`Checkout Failed!\n${error?.message || String(error)}`);
    }
  };

  const handleCloseReceipt = () => {
    setIsReceiptOpen(false);
    setReceiptData(null);
    setCart([]);
    setDiscountAmount(0);
    setShippingCharges(0);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-indigo-500 font-black">Z</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden font-sans", isFullScreenUI && "fixed inset-0 z-[100]")}>
      {/* Premium Header */}
      <header className="h-auto md:h-20 shrink-0 bg-white border-b border-slate-200 flex flex-col md:flex-row items-center px-4 md:px-8 py-3 md:py-0 gap-3 md:gap-8 z-50">
        <div className="flex items-center justify-between w-full md:w-auto gap-4 shrink-0">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg">Z</div>
            <div className="flex flex-col">
              <span className="font-black text-slate-900 uppercase tracking-tighter text-xs">Zimozo</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase">POS</span>
            </div>
          </div>

          {/* Mobile view station selector and register trigger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => isRegisterOpen ? setIsCloseRegisterModalOpen(true) : setIsOpenRegisterModalOpen(true)}
              className={cn(
                "w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-sm",
                isRegisterOpen 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                  : "bg-red-50 text-red-600 border-red-200 animate-pulse"
              )}
            >
              <Receipt size={16} />
            </button>
            <select
              value={selectedLocation?.remote_id || ''}
              onChange={(e) => {
                const loc = locations.find(l => l.remote_id === Number(e.target.value));
                if (loc) handleLocationChange(loc);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black text-slate-900 outline-none max-w-[120px] truncate"
            >
              {locations.map(loc => (
                <option key={loc.remote_id} value={loc.remote_id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="w-full md:flex-1 md:max-w-2xl relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search products..." 
            className="w-full pl-9 pr-9 py-2 bg-slate-100 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 text-xs font-semibold text-slate-800"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            onClick={handleLiveSync} 
            disabled={isCloudSyncing}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
          >
            <RefreshCcw size={14} className={cn(isCloudSyncing && "animate-spin text-indigo-500")} />
          </button>
        </div>

        {/* Desktop Header Actions */}
        <div className="hidden md:flex ml-auto items-center gap-6">
          <button
            onClick={() => isRegisterOpen ? setIsCloseRegisterModalOpen(true) : setIsOpenRegisterModalOpen(true)}
            className={cn(
              "w-12 h-12 rounded-2xl border flex items-center justify-center transition-all shadow-sm",
              isRegisterOpen 
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200" 
                : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200 animate-pulse"
            )}
            title={isRegisterOpen ? `Close Register` : "Open Register"}
          >
            <Receipt size={22} className={cn(isRegisterOpen ? "text-emerald-600" : "text-red-600")} />
          </button>

          <div className="flex flex-col text-right relative">
            <select
              value={selectedLocation?.remote_id || ''}
              onChange={(e) => {
                const loc = locations.find(l => l.remote_id === Number(e.target.value));
                if (loc) handleLocationChange(loc);
              }}
              className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 outline-none cursor-pointer shadow-sm transition-all text-right max-w-[150px] truncate"
            >
              {locations.map(loc => (
                <option key={loc.remote_id} value={loc.remote_id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <span className="text-[9px] text-indigo-600 font-black uppercase tracking-widest mt-0.5 pr-2">Active Station</span>
          </div>

          <button 
            onClick={() => { 
              (window as any).electronAPI?.toggleFullScreen();
              setIsFullScreenUI(prev => !prev);
            }} 
            className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-all" 
            title="Toggle Full Screen"
          >
            <Maximize size={22} />
          </button>
          <button className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-all">
            <User size={22} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Sleek Order Pad */}
        <div className={cn(
          "w-full md:w-[360px] bg-white border-r border-slate-200 flex-col z-40 shrink-0 h-full",
          activeMobileTab === 'cart' ? "flex" : "hidden md:flex"
        )}>
          <div className="p-4 flex flex-col gap-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg uppercase tracking-tighter flex items-center gap-2">
                <ShoppingCart size={20} className="text-indigo-500" />
                Order pad
              </h3>
              <span className="px-3 py-1 bg-indigo-500/10 text-indigo-600 text-[10px] font-black rounded-full uppercase">Items: {cart.length}</span>
            </div>

            {/* Premium Customer Search & Select Bar */}
            <div className="relative flex items-center gap-2 z-50">
              <div className="relative flex-1">
                <button 
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left font-bold text-xs text-slate-700 flex items-center justify-between hover:bg-slate-100/55 transition-all outline-none"
                >
                  <span className="truncate flex items-center gap-2">
                    <User size={16} className="text-indigo-500" />
                    {selectedContact ? (
                      <div className="flex items-center gap-2">
                        <span>{selectedContact.name} {selectedContact.phone ? `(${selectedContact.phone})` : ''}</span>
                        {Number(selectedContact.balance || 0) > 0 && (
                          <span className="bg-red-50 border border-red-100 text-red-600 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider animate-pulse">Due: ${Number(selectedContact.balance).toFixed(2)}</span>
                        )}
                      </div>
                    ) : 'Select Customer'}
                  </span>
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </button>

                {isCustomerDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden p-2 flex flex-col gap-2 animate-in fade-in duration-200">
                    <div className="relative flex items-center">
                      <Search size={14} className="absolute left-3 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search customer..." 
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-center text-[10px] text-slate-400 font-bold uppercase">No customers found</div>
                      ) : (
                        filteredCustomers.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => {
                              setSelectedContact(c);
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearchQuery('');
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs rounded-xl font-bold transition-all flex items-center justify-between",
                              selectedContact?.id === c.id 
                                ? "bg-indigo-50 text-indigo-600" 
                                : "text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{c.name || 'No Name'}</span>
                              {Number(c.balance || 0) > 0 && (
                                <span className="text-[9px] text-red-500 font-black">Due: ${Number(c.balance).toFixed(2)}</span>
                              )}
                            </div>
                            {c.phone && <span className="text-[10px] text-slate-400 shrink-0 ml-2 font-medium">{c.phone}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setIsAddCustomerModalOpen(true)}
                className="w-12 h-12 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 transition-all shrink-0 active:scale-95"
                title="Add Customer"
              >
                <UserPlus size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar bg-slate-50/30">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <LayoutGrid size={120} className="text-slate-300" />
                <p className="font-black uppercase tracking-widest mt-4 text-center text-slate-400">Scan barcode or search<br/>to add items</p>
              </div>
            ) : cart.map(item => (
              <div key={item.id} className="py-2.5 px-3 bg-white border border-slate-200/70 rounded-xl flex items-center justify-between gap-2 hover:bg-indigo-50/30 transition-all shadow-sm group relative">
                {/* Clickable Info Area */}
                <div 
                  onClick={() => handleCartItemClick(item)}
                  className="flex-1 min-w-0 cursor-pointer flex flex-col"
                  title="Click to edit price, discount or warranty options"
                >
                  <span className="font-bold text-xs text-slate-800 truncate" title={item.name}>{item.name}</span>
                  
                  {/* Inline micro badges to keep it 1 line vertically */}
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-slate-400 font-bold">
                      ${(item.customPrice !== undefined ? item.customPrice : item.price).toFixed(2)}
                    </span>
                    {((item as any).selectedVariation && (item as any).selectedVariation !== 'Standard') && (
                      <span className="text-[8px] px-1 bg-indigo-50 text-indigo-500 rounded font-black uppercase">
                        {(item as any).selectedVariation}
                      </span>
                    )}
                    {(item as any).selectedLot && (
                      <span className="text-[8px] px-1 bg-amber-50 text-amber-600 rounded font-black">
                        L: {(item as any).selectedLot}
                      </span>
                    )}
                    {(item as any).selectedExpiry && (
                      <span className="text-[8px] px-1 bg-red-50 text-red-500 rounded font-black">
                        E: {(item as any).selectedExpiry}
                      </span>
                    )}
                    {item.selectedWarranty && item.selectedWarranty !== 'No Warranty' && (
                      <span className="text-[8px] px-1 bg-emerald-50 text-emerald-600 rounded font-black">
                        🛡️ {item.selectedWarranty}
                      </span>
                    )}
                    {(item.lineDiscount || 0) > 0 && (
                      <span className="text-[8px] px-1 bg-emerald-100 text-emerald-700 rounded font-black uppercase">
                        {item.lineDiscountType === 'percentage' ? `${item.lineDiscount}%` : `-$${item.lineDiscount?.toFixed(2)}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side controls: Qty, Subtotal & X Remove */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Compact Qty */}
                  <div className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }} 
                      className="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 transition-all text-slate-500"
                    >
                      <Minus size={8} />
                    </button>
                    <span className="w-5 text-center font-black text-[9px] text-indigo-600">{item.quantity}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }} 
                      className="w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 transition-all text-slate-500"
                    >
                      <Plus size={8} />
                    </button>
                  </div>

                  {/* Subtotal */}
                  <span className="font-black text-xs text-slate-900 min-w-[50px] text-right">
                    ${(((item.customPrice !== undefined ? item.customPrice : item.price) - getCalculatedItemDiscount(item as CartItem)) * item.quantity).toFixed(2)}
                  </span>

                  {/* Line removal X button */}
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setCart(prev => prev.filter(ci => ci.id !== item.id)); 
                    }} 
                    className="w-6 h-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all ml-1"
                    title="Remove item"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 space-y-3 bg-white border-t border-slate-200 shrink-0">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <span>Subtotal</span>
              <span className="text-slate-900 font-black">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Shipping / Discount</span>
              <div className="flex gap-2 items-center">
                <div className="flex items-center bg-slate-100 rounded-lg pr-1">
                  <input type="number" value={discountAmount} onChange={(e) => handleGlobalDiscountChange(Number(e.target.value), globalDiscountType)} className="w-12 bg-transparent border-none rounded-l-lg p-1 text-[10px] text-right font-black text-slate-900 shadow-inner outline-none" placeholder="Disc" />
                  <select 
                    value={globalDiscountType} 
                    onChange={(e) => handleGlobalDiscountChange(discountAmount, e.target.value as 'fixed' | 'percentage')}
                    className="bg-transparent border-none text-[9px] font-black text-slate-500 outline-none cursor-pointer pl-0 py-1"
                  >
                    <option value="fixed">$</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
                <input type="number" value={shippingCharges} onChange={(e) => setShippingCharges(Number(e.target.value))} className="w-12 bg-slate-100 border-none rounded-lg p-1 text-[10px] text-right font-black text-slate-900 shadow-inner outline-none" placeholder="Ship" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Order Tax</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold">${tax.toFixed(2)}</span>
                <select 
                  value={taxRate} 
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="bg-slate-100 border-none rounded-lg p-1 text-[10px] font-black text-slate-900 outline-none shadow-sm cursor-pointer"
                >
                  <option value={0}>No Tax (0%)</option>
                  {taxRates.map(tr => (
                    <option key={tr.id} value={tr.amount / 100}>{tr.name} ({tr.amount}%)</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <div className="flex justify-between items-end mb-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">Grand Total</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">${total.toFixed(2)}</span>
                </div>
                <button onClick={() => setCart([])} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
              </div>
              <button 
                onClick={() => {
                  if (!isRegisterOpen) { setIsOpenRegisterModalOpen(true); return; }
                  if (cart.length) setIsCheckoutOpen(true);
                }}
                className={cn("w-full py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:scale-[1.01] active:scale-95 transition-all", isRegisterOpen && cart.length ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-600/20" : "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed")}
              >
                {!isRegisterOpen ? 'Open Register First' : 'Proceed to Checkout'}
              </button>
            </div>
          </div>
        </div>

        {/* Premium Gallery */}
        <div className={cn(
          "flex-1 flex-col min-w-0 bg-slate-50 h-full",
          activeMobileTab === 'products' ? "flex" : "hidden md:flex"
        )}>
          <div className="h-20 flex items-center px-8 gap-3 overflow-x-auto no-scrollbar shrink-0 bg-white border-b border-slate-200">
            {locationCategories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                  activeCategory === cat 
                    ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-105" 
                    : "bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div 
            className="flex-1 overflow-y-auto p-4 custom-scrollbar"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px', alignContent: 'start' }}
          >
            {filteredProducts.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <Package size={32} className="text-slate-300" />
                </div>
                <p className="font-black text-sm uppercase tracking-widest">No products at this location</p>
                <p className="text-xs text-center max-w-xs">This branch has no inventory assigned yet. Sync or switch to another location.</p>
              </div>
            ) : (
              filteredProducts.map(product => (
              <div 
                key={product.id}
                onClick={() => handleProductClick(product)}
                className="group relative bg-white border border-slate-200/80 rounded-xl p-1.5 flex flex-col h-[155px] hover:bg-indigo-50/40 hover:border-indigo-400 transition-all cursor-pointer overflow-hidden shadow-sm hover:shadow-md"
              >
                <div className="h-[75px] w-full bg-slate-50 rounded-lg overflow-hidden relative mb-1.5 shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 group-hover:scale-105 transition-transform">
                      <Package size={28} />
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 bg-white/95 px-1 py-0.5 rounded text-[8px] font-black text-indigo-600 border border-slate-100 shadow-sm">
                    ${product.price.toFixed(2)}
                  </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <h4 className="font-bold text-[9px] text-slate-800 line-clamp-2 leading-tight flex-1" title={product.name}>{product.name}</h4>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 mt-1 shrink-0">
                    <span className={cn("px-1 py-0.5 rounded text-[6px] font-black uppercase", getProductStock(product) > 10 ? "bg-green-50 text-green-600 border border-green-100" : "bg-red-50 text-red-600 border border-red-100")}>
                      {getProductStock(product)} Stk
                    </span>
                    <span className="text-[6px] text-slate-400 font-bold uppercase truncate ml-1">{(product.category || 'Gen').substring(0,8)}</span>
                  </div>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modern Multi-Payment Overlay */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-6">
          <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-3xl overflow-hidden flex animate-in zoom-in-95 duration-500 border border-slate-200">
            <div className="w-1/3 bg-slate-50 p-12 flex flex-col border-r border-slate-200">
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-12 text-slate-900">Split<br/>Payment</h3>
              <div className="space-y-6 flex-1">
                <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold uppercase">Payable</span><span className="text-slate-900 font-black">${total.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold uppercase">Collected</span><span className="text-emerald-600 font-black">${totalPaid.toFixed(2)}</span></div>
                
                <div className="pt-12 border-t border-slate-200 mt-auto">
                    {remainingToPay > 0 ? (
                        <>
                            <p className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] mb-2">Remaining</p>
                            <p className="text-6xl font-black text-slate-900 tracking-tighter">${remainingToPay.toFixed(2)}</p>
                        </>
                    ) : remainingToPay < 0 ? (
                        <>
                            <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] mb-2">Change</p>
                            <p className="text-6xl font-black text-emerald-600 tracking-tighter">${Math.abs(remainingToPay).toFixed(2)}</p>
                        </>
                    ) : (
                        <div className="flex items-center gap-3 text-emerald-600 font-black uppercase tracking-widest animate-pulse">
                            <CheckCircle2 size={32} /> Fully Paid
                        </div>
                    )}
                </div>
              </div>
            </div>

            <div className="flex-1 p-16 flex flex-col bg-white">
              <div className="flex justify-between items-center mb-12">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Payment Breakdown</span>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-red-50 transition-all text-slate-400 hover:text-red-500"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex gap-4 items-center animate-in slide-in-from-right-4">
                    <select 
                      value={p.method} 
                      onChange={(e) => handleUpdatePayment(idx, 'method', e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {paymentMethods.length > 0 ? (
                        paymentMethods.map(pm => (
                          <option key={pm.name} value={pm.name}>{pm.label}</option>
                        ))
                      ) : (
                        <>
                          <option value="cash">💵 Cash</option>
                          <option value="card">💳 Card</option>
                          <option value="bank_transfer">🏦 Bank Transfer</option>
                          <option value="cheque">✍️ Cheque</option>
                          <option value="other">⚙️ Other</option>
                        </>
                      )}
                    </select>
                    <div className="relative flex-1">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                        <input 
                            type="number" 
                            value={p.amount} 
                            onChange={(e) => handleUpdatePayment(idx, 'amount', Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-6 py-4 font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    {payments.length > 1 && (
                        <button onClick={() => setPayments(payments.filter((_, i) => i !== idx))} className="p-4 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                    )}
                  </div>
                ))}
                
                <button 
                    onClick={handleAddPayment}
                    className="flex items-center gap-2 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:text-indigo-800 transition-colors pt-4"
                >
                    <Plus size={16} /> Add Split Payment
                </button>
              </div>

              <button 
                onClick={handleCheckout} 
                disabled={remainingToPay > 0.01 && (selectedContact?.name?.toLowerCase().includes('walk-in') || selectedContact?.name?.toLowerCase().includes('walk in'))}
                className="mt-12 w-full py-6 bg-gradient-to-r from-indigo-500 to-purple-600 disabled:from-slate-100 disabled:to-slate-200 disabled:text-slate-400 text-white rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-2xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                {remainingToPay > 0.01 ? 'Complete Credit Sale' : 'Complete Transaction'}
              </button>
              {remainingToPay > 0.01 && (selectedContact?.name?.toLowerCase().includes('walk-in') || selectedContact?.name?.toLowerCase().includes('walk in')) && (
                <p className="mt-4 text-center text-xs font-black text-red-500 uppercase tracking-widest leading-relaxed animate-pulse">
                  ⚠️ Credit sales are not allowed for Walk-In Customer.<br/>Please select a registered customer.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== RECEIPT / PRINT MODAL ========== */}
      {isReceiptOpen && receiptData && (
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
              <h3 className="text-xl font-black uppercase tracking-widest">Transaction Finalized</h3>
              <p className="text-indigo-200 text-xs mt-1">Invoice successfully queued for ERP sync</p>
            </div>

            {/* Screen Receipt Preview */}
            <div className="p-8 space-y-6 flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar bg-slate-50 dark:bg-slate-950">
              <div id="screen-receipt-view" className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 text-xs font-mono text-slate-700 dark:text-slate-300">
                <div className="text-center space-y-1">
                  <h4 className="text-base font-black text-slate-900 dark:text-white uppercase">{receiptData.locationName}</h4>
                  <p className="text-slate-400">Zimozo Premium POS</p>
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-1">
                  <p className="flex justify-between"><span>Inv No:</span> <strong>{receiptData.invoiceNo}</strong></p>
                  <p className="flex justify-between"><span>Date:</span> <span>{receiptData.date}</span></p>
                  <p className="flex justify-between"><span>Cashier:</span> <span className="capitalize">{user?.name || 'Staff'}</span></p>
                  <p className="flex justify-between"><span>Customer:</span> <span>{receiptData.customerName}</span></p>
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-2">
                  <div className="font-bold border-b border-slate-100 pb-1 flex justify-between">
                    <span className="w-1/2">Item</span>
                    <span className="w-1/4 text-center">Qty</span>
                    <span className="w-1/4 text-right">Total</span>
                  </div>
                  {receiptData.items.map((item: any, i: number) => {
                    const price = item.customPrice !== undefined ? item.customPrice : item.price;
                    const discount = getCalculatedItemDiscount(item);
                    const finalPrice = price - discount;
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
                        <span className="w-1/4 text-right font-bold">${(finalPrice * item.quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <p className="text-slate-400">--------------------------------</p>
                </div>

                <div className="space-y-1 pt-2">
                  <p className="flex justify-between"><span>Subtotal:</span> <span>${receiptData.subtotal.toFixed(2)}</span></p>
                  {receiptData.discount > 0 && (
                    <p className="flex justify-between text-red-500 font-bold"><span>Discount:</span> <span>-${receiptData.discount.toFixed(2)}</span></p>
                  )}
                  {receiptData.tax > 0 && (
                    <p className="flex justify-between"><span>Tax:</span> <span>${receiptData.tax.toFixed(2)}</span></p>
                  )}
                  {receiptData.shipping > 0 && (
                    <p className="flex justify-between"><span>Shipping:</span> <span>${receiptData.shipping.toFixed(2)}</span></p>
                  )}
                  <p className="flex justify-between text-base font-black text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-800 pt-2">
                    <span>Grand Total:</span>
                    <span>${receiptData.total.toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between text-emerald-600 font-bold"><span>Paid:</span> <span>${receiptData.paid.toFixed(2)}</span></p>
                  {receiptData.due > 0 && (
                    <p className="flex justify-between text-red-500 font-black"><span>Outstanding Dues:</span> <span>${receiptData.due.toFixed(2)}</span></p>
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
                    const settings = electronAPI ? await electronAPI.getSettings() : null;
                    const printer = settings?.receiptPrinter || '';
                    const silent = settings?.silentPrint ?? true;
                    
                    if (electronAPI?.printReceipt) {
                      await electronAPI.printReceipt(html, printer, silent);
                    } else {
                      window.print();
                    }
                  } catch (e) {
                    console.error('Offscreen print failed, falling back:', e);
                    window.print();
                  }
                }}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 animate-pulse"
              >
                Print Receipt
              </button>
              <button 
                onClick={handleCloseReceipt}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black uppercase text-xs tracking-widest transition-colors"
              >
                Close & New Order
              </button>
            </div>
          </div>

          {/* Hidden 80mm Print Layout solely rendered during printing */}
          <div id="printable-receipt-container" className="hidden">
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', textTransform: 'uppercase' }}>{receiptData.locationName}</h3>
              <p style={{ margin: '0 0 5px 0', color: '#666' }}>Zimozo Premium POS Receipt</p>
              <p style={{ margin: '0' }}>--------------------------------</p>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ width: '40%' }}>Invoice No:</td><td style={{ width: '60%', fontWeight: 'bold' }}>{receiptData.invoiceNo}</td></tr>
                  <tr><td>Date:</td><td>{receiptData.date}</td></tr>
                  <tr><td>Cashier:</td><td>{user?.name || 'Staff'}</td></tr>
                  <tr><td>Customer:</td><td>{receiptData.customerName}</td></tr>
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
                  {receiptData.items.map((item: any, i: number) => {
                    const price = item.customPrice !== undefined ? item.customPrice : item.price;
                    const discount = getCalculatedItemDiscount(item);
                    const finalPrice = price - discount;
                    return (
                      <tr key={i} style={{ borderBottom: '1px dashed #ccc' }}>
                        <td style={{ padding: '4px 0' }}>
                          <span style={{ fontWeight: 'bold', display: 'block' }}>{item.name}</span>
                          {item.selectedVariation && <span style={{ fontSize: '9px', color: '#666', display: 'block' }}>Var: {item.selectedVariation}</span>}
                          {item.selectedLot && <span style={{ fontSize: '9px', color: '#666', display: 'block' }}>Lot: {item.selectedLot}</span>}
                        </td>
                        <td style={{ textAlign: 'center', padding: '4px 0' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '4px 0' }}>${(finalPrice * item.quantity).toFixed(2)}</td>
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
                  <tr><td style={{ textAlign: 'left' }}>Subtotal:</td><td>${receiptData.subtotal.toFixed(2)}</td></tr>
                  {receiptData.discount > 0 && <tr><td style={{ textAlign: 'left', color: 'red' }}>Discount:</td><td>-${receiptData.discount.toFixed(2)}</td></tr>}
                  {receiptData.tax > 0 && <tr><td style={{ textAlign: 'left' }}>Tax:</td><td>${receiptData.tax.toFixed(2)}</td></tr>}
                  {receiptData.shipping > 0 && <tr><td style={{ textAlign: 'left' }}>Shipping:</td><td>${receiptData.shipping.toFixed(2)}</td></tr>}
                  <tr style={{ fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid #000' }}>
                    <td style={{ textAlign: 'left', paddingTop: '4px' }}>Grand Total:</td>
                    <td style={{ paddingTop: '4px' }}>${receiptData.total.toFixed(2)}</td>
                  </tr>
                  <tr style={{ color: 'green' }}><td style={{ textAlign: 'left' }}>Paid:</td><td>${receiptData.paid.toFixed(2)}</td></tr>
                  {receiptData.due > 0 && <tr style={{ color: 'red', fontWeight: 'bold' }}><td style={{ textAlign: 'left' }}>Outstanding:</td><td>${receiptData.due.toFixed(2)}</td></tr>}
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

      {/* ========== OPEN REGISTER MODAL ========== */}
      {isOpenRegisterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-6">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-white">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Receipt size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Open Register</h2>
                  <p className="text-indigo-200 text-[11px] font-bold uppercase tracking-widest">Start Your Shift</p>
                </div>
              </div>
            </div>
            <div className="p-8 space-y-5">
              {registerError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <p className="text-xs font-bold text-red-600">Error: {registerError}</p>
                  <p className="text-[10px] text-red-400 mt-1">Please restart the Electron app and try again. If the problem persists, wipe &amp; re-login.</p>
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Opening Cash Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={openingBalance}
                    onChange={e => setOpeningBalance(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-4 text-3xl font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Enter the amount of cash physically present in the drawer at the start of this shift.</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-bold">Location</span>
                  <span className="text-slate-900 font-black">{selectedLocation?.name || 'Main Branch'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-bold">Date</span>
                  <span className="text-slate-900 font-black">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-bold">Time</span>
                  <span className="text-slate-900 font-black">{new Date().toLocaleTimeString()}</span>
                </div>
              </div>
              <button
                onClick={handleOpenRegister}
                disabled={isOpeningRegister}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 disabled:from-slate-300 disabled:to-slate-400 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isOpeningRegister ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Opening...</>
                ) : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== CLOSE REGISTER MODAL ========== */}
      {isCloseRegisterModalOpen && (
        <CloseRegisterModal
          currentRegister={currentRegister}
          db={db}
          onClose={() => setIsCloseRegisterModalOpen(false)}
          onConfirmClose={handleCloseRegister}
        />
      )}

      {/* ========== ADD CUSTOMER MODAL ========== */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Add Customer</h2>
                  <p className="text-indigo-200 text-[11px] font-bold uppercase tracking-widest">Register New Contact</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddCustomerModalOpen(false)} 
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all outline-none"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Phone / Mobile</label>
                <input
                  type="text"
                  placeholder="e.g. +94771234567"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Physical Address</label>
                <textarea
                  placeholder="e.g. 123 Main St, Colombo"
                  value={newCustomer.address}
                  onChange={e => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm min-h-[80px]"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleAddCustomer}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Save Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== PRODUCT OPTIONS MODAL (BEFORE & AFTER FLOWS) ========== */}
      {optionProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[250] p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <Grid size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black uppercase tracking-tight truncate max-w-[250px]">{optionProduct.name}</h2>
                  <p className="text-indigo-200 text-[9px] font-bold uppercase tracking-widest">
                    {editingCartItemId !== null ? 'Configure Cart Item Options' : 'Select Product Options'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setOptionProduct(null); setEditingCartItemId(null); }} 
                className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all outline-none"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {editingCartItemId === null ? (
                /* ================== FLOW A: BEFORE ADDING TO CART (VARIATION, LOT, EXPIRY) ================== */
                <>
                  {/* Variation Selection */}
                  {availableVars.length > 0 && (
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">1. Select Variation</label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableVars.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSelectedVarOption(opt.name)}
                            className={cn(
                              "p-2.5 rounded-xl border text-[10px] font-bold text-left transition-all",
                              selectedVarOption === opt.name
                                ? "border-indigo-500 bg-indigo-50/50 text-indigo-600 font-black shadow-sm"
                                : "border-slate-200 hover:bg-slate-50 text-slate-600"
                            )}
                          >
                            {opt.name} (${opt.price.toFixed(2)})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lot Number Selection */}
                  {((optionProduct as any).enable_sr_no === 1 || availableLots.length > 0) && (
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">2. Select Lot / Serial Number</label>
                      {availableLots.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {availableLots.map((lot: any) => (
                            <button
                              key={lot.id}
                              type="button"
                              onClick={() => setSelectedLotOption(lot.lot_number)}
                              className={cn(
                                "p-2 rounded-xl border text-[9px] font-bold text-left transition-all",
                                selectedLotOption === lot.lot_number
                                  ? "border-amber-500 bg-amber-50/50 text-amber-600 font-black shadow-sm"
                                  : "border-slate-200 hover:bg-slate-50 text-slate-600"
                              )}
                            >
                              <div className="font-black">{lot.lot_number}</div>
                              {lot.qty_remaining !== undefined && (
                                <div className="text-[8px] opacity-70 mt-0.5">Qty: {lot.qty_remaining}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[9px] text-slate-400 italic">No synced lots found. Enter manually:</p>
                          <input
                            type="text"
                            value={selectedLotOption}
                            onChange={e => setSelectedLotOption(e.target.value)}
                            placeholder="e.g. LOT-2026-A1"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expiry Selection */}
                  {((optionProduct as any).enable_expiry === 1 || availableExpiries.length > 0) && (
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">3. Select Expiry Date</label>
                      {availableExpiries.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {availableExpiries.map(expObj => (
                            <button
                              key={expObj.expiry_date}
                              type="button"
                              onClick={() => setSelectedExpiryOption(expObj.expiry_date)}
                              className={cn(
                                "p-2 rounded-xl border text-[9px] font-bold text-center transition-all",
                                selectedExpiryOption === expObj.expiry_date
                                  ? "border-red-500 bg-red-50/50 text-red-600 font-black shadow-sm"
                                  : "border-slate-200 hover:bg-slate-50 text-slate-600"
                              )}
                            >
                              <div className="font-black">{expObj.expiry_date}</div>
                              <div className="text-[8px] opacity-70 mt-0.5">Qty: {expObj.qty_remaining}</div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[9px] text-slate-400 italic">No synced expiry dates found. Select expiry date:</p>
                          <input
                            type="date"
                            value={selectedExpiryOption}
                            onChange={e => setSelectedExpiryOption(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* ================== FLOW B: AFTER CLOCKED IN ORDER PAD (PRICE, DISCOUNT, WARRANTY) ================== */
                <>
                  {/* Custom Price & Line Discount Option */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Custom Unit Price</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <span className="text-[10px] font-black text-slate-400 mr-2">$</span>
                        <input 
                          type="number"
                          value={optionCustomPrice}
                          onChange={(e) => setOptionCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-transparent border-none p-0 text-xs font-bold text-slate-800 outline-none"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Line Discount</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
                        <input 
                          type="number"
                          value={optionDiscount}
                          onChange={(e) => setOptionDiscount(Number(e.target.value))}
                          className="w-full bg-transparent border-none p-1 text-xs font-bold text-slate-800 outline-none"
                          min={0}
                          step={0.01}
                        />
                        <select
                          value={optionDiscountType}
                          onChange={(e) => setOptionDiscountType(e.target.value as 'fixed' | 'percentage')}
                          className="bg-slate-200 border-none rounded-lg px-2 py-1 text-[10px] font-black text-slate-600 outline-none cursor-pointer ml-1"
                        >
                          <option value="fixed">Fixed ($)</option>
                          <option value="percentage">Percent (%)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Warranty Selection */}
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">🛡️ Select Warranty Period</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['No Warranty', '6 Months Warranty', '1 Year Warranty', '2 Years Warranty'].map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setOptionWarranty(w)}
                          className={cn(
                            "p-2.5 rounded-xl border text-[10px] font-bold text-center transition-all",
                            optionWarranty === w
                              ? "border-emerald-500 bg-emerald-50 text-emerald-600 font-black shadow-sm"
                              : "border-slate-200 hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Confirm Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOptionProduct(null); setEditingCartItemId(null); }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmProductOptions}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 transition-all"
                >
                  {editingCartItemId !== null ? 'Update Cart' : 'Add to Cart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden shrink-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-50">
        <button 
          onClick={() => setActiveMobileTab('products')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full font-black uppercase tracking-widest text-[10px] gap-1 transition-all",
            activeMobileTab === 'products' ? "text-indigo-600" : "text-slate-400"
          )}
        >
          <LayoutGrid size={18} />
          <span>Products</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('cart')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full font-black uppercase tracking-widest text-[10px] gap-1 transition-all relative",
            activeMobileTab === 'cart' ? "text-indigo-600" : "text-slate-400"
          )}
        >
          <div className="relative">
            <ShoppingCart size={18} />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full text-[8px] w-4 h-4 flex items-center justify-center font-bold">
                {cart.length}
              </span>
            )}
          </div>
          <span>Cart</span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }

        @media (max-width: 767px) {
          /* Compact Header */
          header.h-20 {
            height: 3.5rem !important;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
          }
          header.h-20 h1 {
            font-size: 0.9rem !important;
          }
          header.h-20 .gap-4 {
            gap: 0.5rem !important;
          }
          header.h-20 button {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 0.75rem !important;
          }
          header.h-20 select {
            padding-top: 0.25rem !important;
            padding-bottom: 0.25rem !important;
            font-size: 10px !important;
          }

          /* Category Bar */
          .h-20.flex.items-center.px-8 {
            height: 3.25rem !important;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
            gap: 0.5rem !important;
          }
          .h-20.flex.items-center.px-8 button {
            padding: 0.4rem 0.8rem !important;
            border-radius: 0.75rem !important;
            font-size: 9px !important;
          }

          /* Product Cards Grid */
          .flex-1.overflow-y-auto.p-4.custom-scrollbar {
            padding: 0.5rem !important;
            grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)) !important;
            gap: 6px !important;
            display: grid !important;
          }
          .group.relative.bg-white.border.rounded-xl.p-1.5 {
            height: 115px !important;
            padding: 0.35rem !important;
            border-radius: 0.5rem !important;
          }
          .group.relative.bg-white.border.rounded-xl.p-1.5 .h-\[75px\] {
            height: 52px !important;
            border-radius: 0.35rem !important;
            margin-bottom: 0.25rem !important;
          }
          .group.relative.bg-white.border.rounded-xl.p-1.5 h4 {
            font-size: 8px !important;
            line-height: 1.1 !important;
          }
          .group.relative.bg-white.border.rounded-xl.p-1.5 .absolute.bottom-1 {
            font-size: 7.5px !important;
            padding: 1px 2px !important;
          }

          /* Order Pad Sidebar */
          .w-full.md\:w-\[360px\] {
            width: 100% !important;
          }
          .w-full.md\:w-\[360px\] .p-4 {
            padding: 0.75rem !important;
          }
          .w-full.md\:w-\[360px\] h3 {
            font-size: 0.95rem !important;
          }
          .w-full.md\:w-\[360px\] input, 
          .w-full.md\:w-\[360px\] select,
          .w-full.md\:w-\[360px\] button {
            padding-top: 0.5rem !important;
            padding-bottom: 0.5rem !important;
            border-radius: 0.75rem !important;
            font-size: 11px !important;
          }

          /* Cart Item list */
          .overflow-y-auto.flex-1.custom-scrollbar.p-4 {
            padding: 0.5rem !important;
          }
          .flex.items-start.justify-between.gap-3.pb-3 {
            gap: 0.4rem !important;
            padding-bottom: 0.4rem !important;
          }
          .flex.items-start.justify-between.gap-3.pb-3 h4 {
            font-size: 10px !important;
          }
          .flex.items-start.justify-between.gap-3.pb-3 .text-slate-400 {
            font-size: 8px !important;
          }

          /* Modals and Overlays */
          .fixed.inset-0.z-\[200\], .fixed.inset-0.z-\[250\] {
            padding: 0.5rem !important;
          }
          .bg-white.w-full.max-w-md, .bg-white.w-full.max-w-2xl {
            border-radius: 1.25rem !important;
          }
          .bg-white.w-full.max-w-md .p-6, .bg-white.w-full.max-w-2xl .p-6 {
            padding: 1rem !important;
          }
          .bg-white.w-full.max-w-md h2, .bg-white.w-full.max-w-2xl h2 {
            font-size: 1.1rem !important;
          }
          
          /* Checkout Inputs Grid */
          .grid.grid-cols-2.gap-4 {
            gap: 0.5rem !important;
          }
          .p-5.bg-slate-50.rounded-2xl {
            padding: 0.75rem !important;
            border-radius: 1rem !important;
          }
        }
      `}} />
    </div>
  );
}

// ===== CLOSE REGISTER MODAL COMPONENT =====
function CloseRegisterModal({ currentRegister, db, onClose, onConfirmClose }: any) {
  const [stats, setStats] = useState<any>(null);
  const [closingCash, setClosingCash] = useState(0);
  const [cashInAmount, setCashInAmount] = useState(0);
  const [cashInNote, setCashInNote] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState(0);
  const [cashOutNote, setCashOutNote] = useState('');
  const [activeTab, setActiveTab] = useState<'summary'|'cashin'|'cashout'>('summary');
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!currentRegister) return;
    async function loadStats() {
      try {
        const sales = await db.query(
          'SELECT SUM(total_amount) as total, SUM(CASE WHEN payment_method="cash" THEN total_amount ELSE 0 END) as cash_total, SUM(CASE WHEN payment_status!="paid" THEN total_amount ELSE 0 END) as credit_sales FROM sales WHERE created_at >= ?',
          [currentRegister.opened_at]
        );
        
        const paymentMethods = await db.query(
          'SELECT payment_method, SUM(total_amount) as amount FROM sales WHERE created_at >= ? GROUP BY payment_method',
          [currentRegister.opened_at]
        );

        const items = await db.query(
          'SELECT SUM(quantity) as total_products FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.created_at >= ?',
          [currentRegister.opened_at]
        );

        const txns = await db.query(
          'SELECT * FROM cash_register_transactions WHERE register_id = ? ORDER BY created_at DESC',
          [currentRegister.id]
        );
        
        setStats({
          ...sales?.[0],
          total_products: items?.[0]?.total_products || 0,
          paymentMethodsBreakdown: paymentMethods || []
        });
        setTransactions(txns || []);
        setClosingCash(currentRegister.cash_in_hand || 0);
      } catch (e) { console.error(e); }
    }
    loadStats();
  }, [currentRegister]);

  async function handleCashIn() {
    if (!cashInAmount) return;
    await db.execute(
      'INSERT INTO cash_register_transactions (register_id, amount, transaction_type, note) VALUES (?, ?, ?, ?)',
      [currentRegister.id, cashInAmount, 'cash_in', cashInNote || 'Cash In']
    );
    await db.execute(
      'UPDATE cash_registers SET cash_in_hand = cash_in_hand + ? WHERE id = ?',
      [cashInAmount, currentRegister.id]
    );
    setCashInAmount(0); setCashInNote('');
    setActiveTab('summary');
    // Reload
    const txns = await db.query('SELECT * FROM cash_register_transactions WHERE register_id = ? ORDER BY created_at DESC', [currentRegister.id]);
    setTransactions(txns || []);
  }

  async function handleCashOut() {
    if (!cashOutAmount) return;
    await db.execute(
      'INSERT INTO cash_register_transactions (register_id, amount, transaction_type, note) VALUES (?, ?, ?, ?)',
      [currentRegister.id, cashOutAmount, 'cash_out', cashOutNote || 'Cash Out']
    );
    await db.execute(
      'UPDATE cash_registers SET cash_in_hand = cash_in_hand - ? WHERE id = ?',
      [cashOutAmount, currentRegister.id]
    );
    setCashOutAmount(0); setCashOutNote('');
    setActiveTab('summary');
    const txns = await db.query('SELECT * FROM cash_register_transactions WHERE register_id = ? ORDER BY created_at DESC', [currentRegister.id]);
    setTransactions(txns || []);
  }

  const totalSales = Number(stats?.total || 0);
  const cashSales = Number(stats?.cash_total || 0);
  const cardSales = Number(stats?.card_total || 0);
  const openingAmt = Number(currentRegister?.opening_amount || 0);
  const expectedCash = openingAmt + cashSales;
  const difference = closingCash - expectedCash;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-8 py-5 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Receipt size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Close Register</h2>
                <p className="text-red-200 text-[11px] font-bold uppercase tracking-widest">End of Shift Summary</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><X size={18} /></button>
          </div>
          {/* Tab Bar */}
          <div className="flex gap-2 mt-4">
            {[{id:'summary',label:'Summary'},{id:'cashin',label:'Cash In'},{id:'cashout',label:'Cash Out'}].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={cn('px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                  activeTab === tab.id ? 'bg-white text-red-600' : 'bg-white/20 text-white hover:bg-white/30')}
              >{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* SUMMARY TAB */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sales</p>
                  <p className="text-2xl font-black text-slate-900">${totalSales.toFixed(2)}</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Cash Sales</p>
                  <p className="text-2xl font-black text-emerald-700">${cashSales.toFixed(2)}</p>
                </div>
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Total Products</p>
                  <p className="text-2xl font-black text-amber-700">{stats?.total_products || 0}</p>
                </div>
                <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                  <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Credit Sales</p>
                  <p className="text-2xl font-black text-rose-700">${Number(stats?.credit_sales || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              {(stats?.paymentMethodsBreakdown?.length > 0) && (
                <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                  <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-3">Payment Methods</p>
                  <div className="space-y-2">
                    {stats.paymentMethodsBreakdown.map((pm: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-xs text-indigo-900 font-bold capitalize">{pm.payment_method?.replace(/_/g, ' ') || 'Unknown'}</span>
                        <span className="text-xs font-black text-indigo-600">
                          ${Number(pm.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash Transactions Log */}
              {transactions.length > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Cash Movements</p>
                  <div className="space-y-2">
                    {transactions.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs', t.transaction_type==='cash_in' ? 'bg-emerald-500' : 'bg-red-400')}>
                            {t.transaction_type==='cash_in' ? '+' : '-'}
                          </div>
                          <span className="text-xs text-slate-700 font-medium">{t.note}</span>
                        </div>
                        <span className={cn('text-xs font-black', t.transaction_type==='cash_in' ? 'text-emerald-600' : 'text-red-500')}>
                          {t.transaction_type==='cash_in' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Closing cash input */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Actual Closing Cash</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">$</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={closingCash}
                    onChange={e => setClosingCash(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 text-2xl font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Difference */}
              <div className={cn('rounded-2xl p-4 border flex justify-between items-center', difference >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{color: difference >= 0 ? '#059669' : '#dc2626'}}>
                    {difference >= 0 ? 'Overage' : 'Shortage'}
                  </p>
                  <p className="text-xs text-slate-500">Expected: ${expectedCash.toFixed(2)}</p>
                </div>
                <p className={cn('text-3xl font-black', difference >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {difference >= 0 ? '+' : ''}{difference.toFixed(2)}
                </p>
              </div>

              <button
                onClick={onConfirmClose}
                className="w-full py-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
              >Close Register & End Shift</button>
            </div>
          )}

          {/* CASH IN TAB */}
          {activeTab === 'cashin' && (
            <div className="space-y-5">
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-center">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Add Cash to Drawer</p>
                <p className="text-sm text-emerald-700 mt-1">Record money added to the cash drawer (e.g. change from bank).</p>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                  <input type="number" min={0} step={0.01} value={cashInAmount} onChange={e => setCashInAmount(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-4 text-3xl font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0.00" autoFocus />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Note (optional)</label>
                <input type="text" value={cashInNote} onChange={e => setCashInNote(e.target.value)}
                  className="w-full px-4 py-3 text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  placeholder="e.g. Change from bank..." />
              </div>
              <button onClick={handleCashIn}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-95 transition-all"
              >Add Cash In</button>
            </div>
          )}

          {/* CASH OUT TAB */}
          {activeTab === 'cashout' && (
            <div className="space-y-5">
              <div className="bg-red-50 rounded-2xl p-4 border border-red-100 text-center">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Remove Cash from Drawer</p>
                <p className="text-sm text-red-700 mt-1">Record money removed from the cash drawer (e.g. paid expense).</p>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                  <input type="number" min={0} step={0.01} value={cashOutAmount} onChange={e => setCashOutAmount(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-4 text-3xl font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0.00" autoFocus />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Note (optional)</label>
                <input type="text" value={cashOutNote} onChange={e => setCashOutNote(e.target.value)}
                  className="w-full px-4 py-3 text-slate-900 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-medium"
                  placeholder="e.g. Paid supplier..." />
              </div>
              <button onClick={handleCashOut}
                className="w-full py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-red-500/30 hover:scale-[1.02] active:scale-95 transition-all"
              >Remove Cash Out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

