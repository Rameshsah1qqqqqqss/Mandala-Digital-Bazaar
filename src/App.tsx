import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  ShieldCheck,
  Clock,
  Bookmark,
  X,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Store,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { BootstrapPayload, ProductClient } from './types';
import { ProductArtwork } from './components/ProductArtwork';
import { CustomerDashboard } from './components/CustomerDashboard';
import { VendorDashboard } from './components/VendorDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { formatNPR, calculateCheckoutTotals } from '../lib/money';

type PrimaryView = 'storefront' | 'promotions' | 'customer' | 'vendor' | 'admin';

export function App() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<PrimaryView>('storefront');

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Storefront Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc'>('featured');
  const [selectedLegalSlug, setSelectedLegalSlug] = useState<string>('how-to-order');
  const [promoBannerDismissed, setPromoBannerDismissed] = useState(false);

  // Contiguous Product Detail & Checkout Modal State
  const [activeProduct, setActiveProduct] = useState<ProductClient | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [checkoutQty, setCheckoutQty] = useState<number>(1);
  const [deliveryInputs, setDeliveryInputs] = useState<Record<string, string>>({});
  const [identifierConfirmed, setIdentifierConfirmed] = useState<boolean>(false);
  const [promoCodeInput, setPromoCodeInput] = useState<string>('NEPAL10');
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] =
    useState<string>('nepalpay_qr');
  const [placingOrder, setPlacingOrder] = useState(false);

  // Account & Role Switcher / Auth Modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'switcher' | 'login' | 'register'>('switcher');
  const [loginEmail, setLoginEmail] = useState('aarav.sharma@example.com.np');
  const [loginPassword, setLoginPassword] = useState('Nepal@2026!');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('+977-9841000000');
  const [regPassword, setRegPassword] = useState('');

  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load marketplace state from server');
      const json: BootstrapPayload = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveProduct(null);
        setAuthModalOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function openProductCheckout(product: ProductClient) {
    setActiveProduct(product);
    const matchingVariant =
      product.variants.find((v) => v.pricePaisa === product.pricePaisa) || product.variants[0];
    setSelectedVariantId(matchingVariant?.variantId || '');
    setCheckoutQty(1);
    const defaultInputs: Record<string, string> = {};
    for (const field of product.requiredCustomerFields) {
      if (field.key === 'playerUid') defaultInputs[field.key] = '5182930412';
      else if (field.key === 'inGameName') defaultInputs[field.key] = 'GorkhaSniperNP';
      else if (field.key === 'serverRegion') defaultInputs[field.key] = 'Global / South Asia';
      else if (field.key === 'telecomMobileNumber') defaultInputs[field.key] = '9808765432';
      else if (field.key === 'operatorName') defaultInputs[field.key] = 'Ncell Nepal';
      else defaultInputs[field.key] = data?.currentUser.email || 'aarav.sharma@example.com.np';
    }
    setDeliveryInputs(defaultInputs);
    setIdentifierConfirmed(false);
  }

  async function handleSwitchRole(userId: string) {
    try {
      const res = await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Role switch failed');
      await fetchBootstrap();
      notify(`Active session switched to ${json.user.fullName} [${json.user.roles.join(', ')}].`);
      setAuthModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error switching account', 'error');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      await fetchBootstrap();
      notify(`Signed in as ${json.user.fullName}.`, 'success');
      setAuthModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Invalid credentials', 'error');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regName,
          email: regEmail,
          mobileNumber: regMobile,
          password: regPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      await fetchBootstrap();
      notify(`Welcome ${json.user.fullName}! Account registered in Nepal.`, 'success');
      setAuthModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Registration error', 'error');
    }
  }

  async function handleToggleSaveProduct(productId: string) {
    try {
      const res = await fetch('/api/customer/toggle-saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error('Failed to save item');
      await fetchBootstrap();
      notify('Updated Saved Products list.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error updating saved items', 'error');
    }
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProduct) return;
    setPlacingOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: activeProduct.id,
          variantId: selectedVariantId || activeProduct.variants[0]?.variantId,
          quantity: checkoutQty,
          paymentMethodCode: selectedPaymentMethodCode,
          customerDeliveryInputs: deliveryInputs,
          identifierConfirmedByCustomer: identifierConfirmed,
          promoCode: promoCodeInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Order creation failed');
      await fetchBootstrap();
      setActiveProduct(null);
      setActiveView('customer');
      notify(
        `Order ${json.order.orderNumber} placed (${formatNPR(
          json.order.finalTotalPaisa
        )}). Submit your manual payment reference in Customer Hub.`,
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout validation failed', 'error');
    } finally {
      setPlacingOrder(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-700">
        <div className="text-center space-y-2">
          <div className="text-lg font-bold font-display">Mandala Digital Bazaar</div>
          <div className="text-xs text-slate-500">
            Loading Nepal Multi-Vendor Marketplace & RBAC Engine...
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Marketplace Connection Error</h1>
          <p className="text-xs text-slate-600">{error || 'Unable to load state'}</p>
          <button
            onClick={fetchBootstrap}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Only approved products from Approved vendors appear in the public purchasable storefront
  const approvedVendorIds = new Set(
    data.vendors.filter((v) => v.status === 'Approved').map((v) => v.id)
  );
  const publicProducts = data.products
    .filter((p) => p.approvalStatus === 'Approved' && approvedVendorIds.has(p.vendorId))
    .filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (selectedVendorId !== 'all' && p.vendorId !== selectedVendorId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.subcategory.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.vendorName.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return a.pricePaisa - b.pricePaisa;
      if (sortBy === 'price_desc') return b.pricePaisa - a.pricePaisa;
      return Number(b.isFeatured) - Number(a.isFeatured);
    });

  // Live checkout preview math for modal
  const selectedVariant =
    activeProduct?.variants.find((v) => v.variantId === selectedVariantId) ||
    activeProduct?.variants[0];
  const matchedPromo = data.promotions.find(
    (p) => p.code === promoCodeInput.trim().toUpperCase()
  );
  const checkoutPreview =
    activeProduct && selectedVariant
      ? calculateCheckoutTotals({
          unitPricePaisa: selectedVariant.pricePaisa,
          quantity: checkoutQty,
          promo: matchedPromo
            ? {
                ...matchedPromo,
                startsAt: '2026-01-01T00:00:00.000Z',
                expiresAt: '2027-12-31T23:59:59.000Z',
              }
            : null,
          categoryId: activeProduct.categoryId,
          vendorId: activeProduct.vendorId,
          productId: activeProduct.id,
        })
      : null;

  const activeLegalPage =
    data.branding.legalPages[selectedLegalSlug] || data.branding.legalPages['how-to-order'];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('storefront');
            }}
            className="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            {data.branding.marketplaceName}
          </a>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              onClick={() => setActiveView('storefront')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'storefront'
                  ? 'text-slate-900 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Catalog
            </button>
            <button
              onClick={() => setActiveView('promotions')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'promotions'
                  ? 'text-slate-900 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Promotions
            </button>
            <button
              onClick={() => setActiveView('customer')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'customer'
                  ? 'text-slate-900 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Customer Hub
            </button>
            <button
              onClick={() => setActiveView('vendor')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'vendor'
                  ? 'text-slate-900 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Vendor Center
            </button>
            <button
              onClick={() => setActiveView('admin')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'admin'
                  ? 'text-slate-900 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Admin Console
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setAuthMode('switcher');
                setAuthModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Account & Role
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 text-xs font-medium bg-slate-900 text-white border-slate-700"
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Mobile Navigation + Active RBAC Session Context Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 md:hidden">
            {(
              [
                { id: 'storefront', label: 'Catalog' },
                { id: 'promotions', label: 'Promos' },
                { id: 'customer', label: 'Customer Hub' },
                { id: 'vendor', label: 'Vendor Center' },
                { id: 'admin', label: 'Admin Console' },
              ] as Array<{ id: PrimaryView; label: string }>
            ).map((nav) => (
              <button
                key={nav.id}
                onClick={() => setActiveView(nav.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
                  activeView === nav.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {nav.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5 shrink-0">
            <UserCheck className="w-3.5 h-3.5 text-slate-800 shrink-0" />
            <span>
              Signed in as <strong className="text-slate-900">{data.currentUser.fullName}</strong>
            </span>
            <span>·</span>
            <span className="font-mono text-slate-700">
              [{data.currentUser.roles.join(', ')}]
            </span>
            <span>·</span>
            <span>NPR · NPT</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-0.5">Persona:</span>
            {[
              { id: 'usr_customer_aarav', label: 'Customer (Aarav)', targetView: 'customer' as const },
              { id: 'usr_vendor_kantipur', label: 'Vendor (Kantipur)', targetView: 'vendor' as const },
              { id: 'usr_payment_admin', label: 'Payment Admin', targetView: 'admin' as const },
              { id: 'usr_kyc_admin', label: 'KYC Admin', targetView: 'admin' as const },
              { id: 'usr_support_admin', label: 'Support Admin', targetView: 'admin' as const },
              { id: 'usr_super_admin', label: 'Super Admin', targetView: 'admin' as const },
            ].map((persona) => (
              <button
                key={persona.id}
                onClick={async () => {
                  await handleSwitchRole(persona.id);
                  setActiveView(persona.targetView);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  data.currentUser.id === persona.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {persona.label}
              </button>
            ))}
          </div>
        </div>

        {/* VIEW 1: PUBLIC STOREFRONT */}
        {activeView === 'storefront' && (
          <div className="space-y-10">
            {/* Slim Dismissible Promo Bar */}
            {data.branding.promotionalBanner.enabled && !promoBannerDismissed && (
              <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between gap-4 text-xs">
                <div className="truncate">
                  <span>{data.branding.promotionalBanner.text} </span>
                  <strong className="font-mono text-amber-300 mx-1">
                    {data.branding.promotionalBanner.code}
                  </strong>
                  <button
                    onClick={() => setActiveView('promotions')}
                    className="underline ml-2 text-slate-200 hover:text-white"
                  >
                    {data.branding.promotionalBanner.linkText}
                  </button>
                </div>
                <button
                  onClick={() => setPromoBannerDismissed(true)}
                  aria-label="Dismiss promotional banner"
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* SECTION 1: HERO SPLIT SHOWCASE & SEARCH */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-slate-500">
                    Nepal Multi-Vendor Digital Store · Manual Payment & Delivery Protection
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-display leading-tight">
                    Authorized Game Top-Ups, Software Subscriptions & Telecom Recharge in NPR.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
                    Every product is sold by a PAN/VAT-verified Nepal merchant. Pay in Nepalese Rupees via NepalPay QR, ConnectIPS, eSewa, or Khalti with auditable manual verification and encrypted license delivery.
                  </p>
                </div>

                {/* Live Search & Category Filter Controls */}
                <div className="space-y-3 pt-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      aria-label="Search digital products, game top-ups, or vendors"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search PUBG UC, Free Fire Diamonds, Steam USD, Canva Pro, Ncell, NTC..."
                      className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setSelectedCategoryId('all')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        selectedCategoryId === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      All Categories ({data.products.filter((p) => p.approvalStatus === 'Approved').length})
                    </button>
                    {data.categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          selectedCategoryId === cat.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column Featured Spotlight Card */}
              <div className="lg:col-span-5 bg-[#0F172A] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-2">
                  <div className="text-xs font-mono text-amber-300">
                    VERIFIED NEPAL DIGITAL FULFILLMENT PROTOCOL
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold font-display">
                    Zero Password Sharing. 100% Authorized Resellers.
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Game top-ups require only your numeric Player UID and Server ID. Gift cards and software licenses are encrypted with AES-256-GCM and unlocked in your private Customer Hub once payment is verified.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-400">Payment Verification</div>
                    <div className="text-sm font-semibold text-white mt-0.5">
                      ConnectIPS · NepalPay QR · eSewa · Khalti
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Fulfillment SLA</div>
                    <div className="text-sm font-semibold text-emerald-300 font-mono mt-0.5">
                      10 – 30 Mins (08:00–21:00 NPT)
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => {
                      const pubg = data.products.find((p) => p.id === 'prd_pubg_660');
                      if (pubg) openProductCheckout(pubg);
                    }}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-amber-300 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Quick Order: PUBG 660 UC (Rs. 1,450)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* SECTION 2: APPROVED DIGITAL PRODUCTS CATALOG GRID */}
            <section className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-display">
                    Approved Digital Products & Instant Packages
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showing {publicProducts.length} verified products from active Nepal merchants · All prices in Nepalese Rupees (Rs. / NPR)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Filter by verified vendor"
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="all">All Verified Vendors</option>
                    {data.vendors
                      .filter((v) => v.status === 'Approved')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.shopName}
                        </option>
                      ))}
                  </select>

                  <select
                    aria-label="Sort digital products"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="featured">Sort: Featured First</option>
                    <option value="price_asc">Price: Low to High (NPR)</option>
                    <option value="price_desc">Price: High to Low (NPR)</option>
                  </select>
                </div>
              </div>

              {publicProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                  <div className="text-sm font-semibold text-slate-800">
                    No matching digital products found
                  </div>
                  <p className="text-xs text-slate-500">
                    Try clearing your search query or switching the category filter.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategoryId('all');
                      setSelectedVendorId('all');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                  >
                    Reset Catalog Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publicProducts.map((product) => {
                    const isSaved = data.currentUser.savedProductIds.includes(product.id);
                    return (
                      <article
                        key={product.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5"
                      >
                        <div>
                          <ProductArtwork product={product} />
                          <div className="p-5 space-y-2.5">
                            {/* Clean unboxed metadata with typographic separators */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                              <span>{product.categoryName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{product.vendorName}</span>
                            </div>

                            <h3 className="text-base font-bold text-slate-900 font-display leading-snug line-clamp-2">
                              {product.title}
                            </h3>

                            <p className="text-xs text-slate-600 line-clamp-2">
                              {product.shortDescription}
                            </p>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] text-slate-500">Starting Package</div>
                            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                              {formatNPR(product.pricePaisa)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleSaveProduct(product.id)}
                              aria-label={
                                isSaved
                                  ? `Remove ${product.title} from saved`
                                  : `Save ${product.title}`
                              }
                              className={`p-2 rounded-lg border transition-colors ${
                                isSaved
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-300 hover:text-slate-900'
                              }`}
                            >
                              <Bookmark className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openProductCheckout(product)}
                              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Configure & Order
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SECTION 3: VERIFIED NEPAL VENDORS & LEGAL / POLICY DIRECTORY */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4 border-t border-slate-200">
              <div className="lg:col-span-5 space-y-4">
                <h2 className="text-lg font-bold text-slate-900 font-display">
                  Approved Nepal Digital Vendors
                </h2>
                <div className="space-y-3">
                  {data.vendors
                    .filter((v) => v.status === 'Approved')
                    .map((vendor) => (
                      <div
                        key={vendor.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900">
                            {vendor.shopName}
                          </span>
                          <span className="text-xs font-mono text-emerald-700">
                            {vendor.panVatNumber}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {vendor.address} · Reg: {vendor.businessRegNumber}
                        </div>
                        <p className="text-xs text-slate-600">
                          {vendor.resellerAuthorizationStatement}
                        </p>
                        <button
                          onClick={() => setSelectedVendorId(vendor.id)}
                          className="text-xs font-semibold text-slate-900 underline hover:text-[#C2410C]"
                        >
                          Filter Catalog by {vendor.shopName}
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
                  {Object.values(data.branding.legalPages).map((page) => (
                    <button
                      key={page.slug}
                      onClick={() => setSelectedLegalSlug(page.slug)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        selectedLegalSlug === page.slug
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {page.title.replace('Mandala Digital Bazaar', '').trim() || page.title}
                    </button>
                  ))}
                </div>

                {activeLegalPage && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Official Platform Documentation</span>
                      <span>Last Updated: {activeLegalPage.lastUpdated}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 font-display">
                      {activeLegalPage.title}
                    </h3>
                    <p className="text-xs text-slate-600">{activeLegalPage.summary}</p>
                    <div className="space-y-3 pt-2">
                      {activeLegalPage.sections.map((s, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="text-xs font-bold text-slate-900">{s.heading}</div>
                          <p className="text-xs text-slate-600 leading-relaxed">{s.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* VIEW 2: PROMOTIONS & OFFERS PAGE */}
        {activeView === 'promotions' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Active Nepal Promotional Offers & Discount Rules
              </h1>
              <p className="text-xs text-slate-600">
                All discount codes are validated server-side against minimum NPR order thresholds, per-customer usage limits, and total campaign caps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data.promotions.map((promo) => (
                <div
                  key={promo.code}
                  className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono font-bold text-base text-slate-900">
                        {promo.code}
                      </span>
                      <span>
                        {promo.currentUsageCount} / {promo.totalUsageLimit} Redeemed
                      </span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 font-display">
                      {promo.discountType === 'percentage'
                        ? `${promo.discountValue}% Discount (Up to ${formatNPR(
                            promo.maxDiscountPaisa
                          )})`
                        : `${formatNPR(promo.discountValue)} Flat NPR Discount`}
                    </div>
                    <p className="text-xs text-slate-600">
                      Minimum Order: <strong>{formatNPR(promo.minOrderPaisa)}</strong> · Limit:{' '}
                      {promo.perCustomerLimit} per customer
                      {promo.firstOrderOnly ? ' · First Order Only' : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setPromoCodeInput(promo.code);
                      setActiveView('storefront');
                      notify(`Promo code ${promo.code} selected for your next checkout.`);
                    }}
                    className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Apply {promo.code} & Browse Catalog
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: CUSTOMER DASHBOARD */}
        {activeView === 'customer' && (
          <CustomerDashboard
            data={data}
            onRefresh={fetchBootstrap}
            onSelectProduct={(p) => openProductCheckout(p)}
            notify={notify}
          />
        )}

        {/* VIEW 4: VENDOR DASHBOARD */}
        {activeView === 'vendor' && (
          <VendorDashboard data={data} onRefresh={fetchBootstrap} notify={notify} />
        )}

        {/* VIEW 5: ADMIN & SUPER ADMIN CONSOLE */}
        {activeView === 'admin' && (
          <AdminDashboard data={data} onRefresh={fetchBootstrap} notify={notify} />
        )}
      </main>

      {/* CONTIGUOUS PRODUCT DETAIL & CHECKOUT MODAL */}
      {activeProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-xl my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">
                  {activeProduct.categoryName} · {activeProduct.subcategory} · Sold by{' '}
                  {activeProduct.vendorName}
                </div>
                <h2
                  id="checkout-modal-title"
                  className="text-lg font-bold text-slate-900 font-display"
                >
                  {activeProduct.title}
                </h2>
              </div>
              <button
                onClick={() => setActiveProduct(null)}
                aria-label="Close checkout dialog"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePlaceOrder} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <p className="text-xs text-slate-600 leading-relaxed">{activeProduct.description}</p>

              {/* Step 1: Select Variant & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="checkout-variant-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    1. Select Denomination / Package *
                  </label>
                  <select
                    id="checkout-variant-select"
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {activeProduct.variants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.label} — {formatNPR(v.pricePaisa)} (In Stock: {v.stockCount})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="checkout-qty-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Quantity *
                  </label>
                  <input
                    id="checkout-qty-input"
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={checkoutQty}
                    onChange={(e) => setCheckoutQty(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Step 2: Category-Specific Customer Delivery Identifiers */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-900">
                  2. Required Customer Fulfillment Identifiers (Never Enter Passwords or OTPs)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeProduct.requiredCustomerFields.map((field) => (
                    <div key={field.key}>
                      <label
                        htmlFor={`field-${field.key}`}
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        {field.label} {field.required ? '*' : ''}
                      </label>
                      <input
                        id={`field-${field.key}`}
                        type="text"
                        required={field.required}
                        value={deliveryInputs[field.key] || ''}
                        onChange={(e) =>
                          setDeliveryInputs((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  ))}
                </div>

                {/* Mandatory Identifier Confirmation Checkbox */}
                <label className="flex items-start gap-2.5 pt-2 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={identifierConfirmed}
                    onChange={(e) => setIdentifierConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    I have verified the target identifier ({Object.values(deliveryInputs).join(' / ')}) and confirm its accuracy for manual fulfillment.
                  </span>
                </label>
              </div>

              {/* Step 3: Promo Code & Manual Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="checkout-payment-method"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    3. Manual Payment Method (NPR) *
                  </label>
                  <select
                    id="checkout-payment-method"
                    value={selectedPaymentMethodCode}
                    onChange={(e) => setSelectedPaymentMethodCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.paymentMethods
                      .filter((pm) => pm.isEnabled)
                      .map((pm) => (
                        <option key={pm.code} value={pm.code}>
                          {pm.displayName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="checkout-promo-code"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Promo Code (Optional)
                  </label>
                  <input
                    id="checkout-promo-code"
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                    placeholder="NEPAL10 or DASHAIN200"
                    className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Server-Calculated Price Summary */}
              {checkoutPreview && (
                <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div>
                      Subtotal: <span className="font-mono">{formatNPR(checkoutPreview.subtotalPaisa)}</span>
                      {checkoutPreview.discountPaisa > 0 && (
                        <span className="text-emerald-300 ml-3 font-mono">
                          Promo Discount: -{formatNPR(checkoutPreview.discountPaisa)}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-300">
                      Refund Terms: {activeProduct.refundEligibility}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400">Final Payable Amount</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-amber-300">
                      {formatNPR(checkoutPreview.finalTotalPaisa)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveProduct(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={placingOrder}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg transition-colors"
                >
                  {placingOrder ? 'Creating Order...' : 'Confirm & Place NPR Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCOUNT, LOGIN, REGISTRATION & 12-ROLE SWITCHER MODAL */}
      {authModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="auth-modal-title" className="text-base font-bold text-slate-900 font-display">
                Authentication & Server-Side Session Switcher
              </h2>
              <button
                onClick={() => setAuthModalOpen(false)}
                aria-label="Close authentication modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'switcher', label: 'Instant Role Switcher' },
                    { id: 'login', label: 'Password Sign In' },
                    { id: 'register', label: 'Customer Registration' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setAuthMode(m.id)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      authMode === m.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {authMode === 'switcher' && (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  <p className="text-xs text-slate-600">
                    Select any seeded account below to issue a real HTTP-only session cookie and test server-enforced RBAC permissions:
                  </p>
                  {data.accountsForRoleSwitcher.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => handleSwitchRole(acc.id)}
                      className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                        data.currentUser.id === acc.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{acc.fullName}</div>
                        <div className="opacity-80 font-mono">{acc.email}</div>
                      </div>
                      <span className="font-mono font-semibold">[{acc.roles.join(', ')}]</span>
                    </button>
                  ))}
                </div>
              )}

              {authMode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Password (Default seeded accounts: Nepal@2026!)
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Sign In with Bcrypt & Rate-Limiting
                  </button>
                </form>
              )}

              {authMode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="reg-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Full Name *
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Bikash Thapa"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="reg-email"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Email *
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="bikash@example.com.np"
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-mobile"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Nepal Mobile *
                      </label>
                      <input
                        id="reg-mobile"
                        type="text"
                        required
                        value={regMobile}
                        onChange={(e) => setRegMobile(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-pass"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Password (Min 8 chars) *
                    </label>
                    <input
                      id="reg-pass"
                      type="password"
                      required
                      minLength={8}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Create Customer Account
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLEAN FOOTER */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-8 px-6 text-xs text-slate-500">
        <div className="max-w-[1360px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-bold text-slate-900">{data.branding.marketplaceName}</div>
            <div>{data.branding.footer.copyrightText}</div>
            <div>{data.branding.footer.complianceNote}</div>
          </div>
          <div className="text-left md:text-right space-y-1 shrink-0">
            <div>{data.branding.headquartersAddress}</div>
            <div>
              {data.branding.contactEmail} · {data.branding.supportPhone} ·{' '}
              {data.branding.panVatNumber}
            </div>
            <div>Operating Hours: {data.branding.footer.operatingHours}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
