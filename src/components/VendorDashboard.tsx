import React, { useState } from 'react';
import {
  Store,
  PackagePlus,
  Send,
  Wallet,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { BootstrapPayload } from '../types';
import { formatNPR, formatKathmanduDateTime } from '../../lib/money';

interface VendorDashboardProps {
  data: BootstrapPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type VendorTab =
  | 'overview_earnings'
  | 'assigned_orders'
  | 'products'
  | 'inventory'
  | 'vendor_onboarding';

export const VendorDashboard: React.FC<VendorDashboardProps> = ({
  data,
  onRefresh,
  notify,
}) => {
  const [activeTab, setActiveTab] = useState<VendorTab>('overview_earnings');

  const activeVendor =
    data.vendors.find((v) => v.id === data.currentUser.vendorId) ||
    data.vendors.find((v) => v.status === 'Approved') ||
    data.vendors[0];

  const vendorOrders = data.orders.filter((o) => o.vendorId === activeVendor?.id);
  const vendorProducts = data.products.filter((p) => p.vendorId === activeVendor?.id);
  const vendorInventory = data.digitalInventory.filter(
    (inv) => inv.vendorId === activeVendor?.id
  );
  const vendorSettlements = data.settlements.filter((s) => s.vendorId === activeVendor?.id);

  // Manual Fulfillment State
  const eligibleOrders = vendorOrders.filter(
    (o) =>
      o.paymentStatus === 'Approved' &&
      (o.orderStatus === 'Awaiting Fulfillment' || o.orderStatus === 'Processing')
  );
  const [fulfillOrderId, setFulfillOrderId] = useState(eligibleOrders[0]?.id || '');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [secretCodePlain, setSecretCodePlain] = useState('');

  // New Product Submission State
  const [prodCategoryId, setProdCategoryId] = useState(data.categories[0]?.id || 'cat_gaming');
  const [prodSubcategory, setProdSubcategory] = useState('PUBG Mobile UC');
  const [prodTitle, setProdTitle] = useState('');
  const [prodShortDesc, setProdShortDesc] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPriceNPR, setProdPriceNPR] = useState('1250');
  const [prodSourcingNPR, setProdSourcingNPR] = useState('1120');
  const [prodVariantLabel, setProdVariantLabel] = useState('Standard Digital Package');
  const [prodStock, setProdStock] = useState('50');
  const [prodTerms, setProdTerms] = useState(
    'Authorized digital top-up/license. Verify customer identifier prior to checkout.'
  );
  const [prodAuthorizedConfirmed, setProdAuthorizedConfirmed] = useState(true);

  // Settlement Request State
  const [settlementAmountNPR, setSettlementAmountNPR] = useState('3000');

  // Digital Inventory Add State
  const [invProductId, setInvProductId] = useState(vendorProducts[0]?.id || '');
  const [invBatchRef, setInvBatchRef] = useState('BATCH-NP-2026-11');
  const [invSecretCode, setInvSecretCode] = useState('');

  // New Vendor Application State
  const [appShopName, setAppShopName] = useState('');
  const [appRegNum, setAppRegNum] = useState('OCR-NP-2082-5510');
  const [appPanNum, setAppPanNum] = useState('PAN 611029384');
  const [appCity, setAppCity] = useState('Kathmandu');
  const [appAddress, setAppAddress] = useState('Putalisadak, Kathmandu');
  const [appAuthStatement, setAppAuthStatement] = useState(
    'Official authorized reseller in Nepal with direct publisher wholesale invoices.'
  );
  const [appBankName, setAppBankName] = useState('Nabil Bank Limited');
  const [appAccountNum, setAppAccountNum] = useState('0100192837465');

  async function handleExecuteFulfillment(e: React.FormEvent) {
    e.preventDefault();
    const targetOrderId = fulfillOrderId || eligibleOrders[0]?.id;
    if (!targetOrderId) {
      notify('No paid order awaiting fulfillment selected.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/fulfillment/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          deliveryReference,
          deliveryNotes,
          secretCodePlain: secretCodePlain || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fulfillment failed');
      notify(
        `Order manually fulfilled (Ref: ${json.fulfillment.deliveryReference}). Earnings moved to Available.`,
        'success'
      );
      setDeliveryReference('');
      setDeliveryNotes('');
      setSecretCodePlain('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fulfillment error', 'error');
    }
  }

  async function handleSubmitProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!activeVendor) return;
    try {
      const res = await fetch('/api/vendors/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: activeVendor.id,
          categoryId: prodCategoryId,
          subcategory: prodSubcategory,
          title: prodTitle,
          shortDescription: prodShortDesc,
          description: prodDesc,
          priceNPR: Number(prodPriceNPR),
          sourcingCostNPR: Number(prodSourcingNPR),
          expectedFulfillmentMinutes: 15,
          regionRestriction: 'Nepal / Authorized Global',
          productTerms: prodTerms,
          resellerAuthorizedConfirmed: prodAuthorizedConfirmed,
          variantLabel: prodVariantLabel,
          stockCount: Number(prodStock),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Product submission failed');
      notify(
        `Product "${json.product.title}" submitted with status "Pending Approval".`,
        'success'
      );
      setProdTitle('');
      setProdShortDesc('');
      setProdDesc('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit product', 'error');
    }
  }

  async function handleRequestSettlement(e: React.FormEvent) {
    e.preventDefault();
    if (!activeVendor) return;
    try {
      const res = await fetch('/api/vendors/settlements/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: activeVendor.id,
          amountNPR: Number(settlementAmountNPR),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Settlement request failed');
      notify(
        `Settlement request ${json.settlement.settlementNumber} submitted for Finance Admin payout.`,
        'success'
      );
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Settlement error', 'error');
    }
  }

  async function handleAddInventory(e: React.FormEvent) {
    e.preventDefault();
    const targetProd = vendorProducts.find((p) => p.id === invProductId) || vendorProducts[0];
    if (!targetProd) return;
    try {
      const res = await fetch('/api/inventory/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: targetProd.id,
          variantId: targetProd.variants[0]?.variantId || 'default',
          batchReference: invBatchRef,
          secretCodePlain: invSecretCode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add inventory');
      notify(`Encrypted code ${json.item.secretCodeMasked} added to vault.`, 'success');
      setInvSecretCode('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error adding code', 'error');
    }
  }

  async function handleVendorApply(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/vendors/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: appShopName,
          businessRegNumber: appRegNum,
          panVatNumber: appPanNum,
          contactEmail: data.currentUser.email,
          contactMobile: data.currentUser.mobileNumber,
          city: appCity,
          address: appAddress,
          categories: ['Gaming Top-Ups', 'Software & Subscriptions'],
          resellerAuthorizationStatement: appAuthStatement,
          bankName: appBankName,
          accountName: appShopName,
          accountNumber: appAccountNum,
          branch: appCity,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Vendor application failed');
      notify(
        `Vendor application for "${json.vendor.shopName}" submitted (Pending Review).`,
        'success'
      );
      setAppShopName('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Application failed', 'error');
    }
  }

  return (
    <div className="space-y-8">
      {/* Vendor Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="text-xs text-slate-500">
            <span>Verified Multi-Vendor Merchant Center</span>
            <span className="mx-2">·</span>
            <span>{activeVendor?.panVatNumber}</span>
            <span className="mx-2">·</span>
            <span>Status: {activeVendor?.status}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 font-display">
            {activeVendor?.shopName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {activeVendor?.address} · Commission Rate: {activeVendor?.commissionRatePercent}% ·
            Payout Bank: {activeVendor?.bankPayoutDetails.bankName}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div>
            <div className="text-xs text-slate-500">Pending Earnings</div>
            <div className="text-lg font-bold font-mono tabular-nums text-amber-700">
              {formatNPR(activeVendor?.pendingEarningsPaisa || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Available for Payout</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">
              {formatNPR(activeVendor?.availableEarningsPaisa || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Settled</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {formatNPR(activeVendor?.totalSettledPaisa || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Vendor Center Sections"
        className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl"
      >
        {(
          [
            { id: 'overview_earnings', label: 'Earnings Ledger & Settlements' },
            {
              id: 'assigned_orders',
              label: `Manual Fulfillment Queue (${eligibleOrders.length})`,
            },
            {
              id: 'products',
              label: `Product Catalog & Submissions (${vendorProducts.length})`,
            },
            {
              id: 'inventory',
              label: `Digital Code Vault (${vendorInventory.length})`,
            },
            { id: 'vendor_onboarding', label: 'New Vendor Application' },
          ] as Array<{ id: VendorTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: EARNINGS LEDGER & SETTLEMENTS */}
      {activeTab === 'overview_earnings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Vendor Order Sales & Commission Breakdown
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Vendors cannot edit balances. Earnings transition from Pending to Available only after verified manual delivery.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Order</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Net Collected</th>
                    <th className="py-3 px-4 font-semibold text-right">Commission</th>
                    <th className="py-3 px-4 font-semibold text-right">Vendor Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {vendorOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900">
                          {o.orderNumber}
                        </div>
                        <div className="text-slate-500 truncate max-w-[200px]">
                          {o.productSnapshot.title}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{o.orderStatus}</div>
                        <div className="text-slate-500">{o.paymentStatus}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatNPR(o.finalTotalPaisa)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        -{formatNPR(o.marketplaceCommissionPaisa)} ({o.commissionRatePercent}%)
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700">
                        {formatNPR(o.vendorNetEarningPaisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span>Request Vendor Settlement Payout</span>
              </h3>
              <p className="text-xs text-slate-600">
                Minimum settlement request is Rs. 2,500. Available balance:{' '}
                <strong className="font-mono text-slate-900">
                  {formatNPR(activeVendor?.availableEarningsPaisa || 0)}
                </strong>
              </p>
              <form onSubmit={handleRequestSettlement} className="space-y-3">
                <div>
                  <label
                    htmlFor="settlement-amt-npr"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Requested Payout Amount (NPR) *
                  </label>
                  <input
                    id="settlement-amt-npr"
                    type="number"
                    min={2500}
                    required
                    value={settlementAmountNPR}
                    onChange={(e) => setSettlementAmountNPR(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Submit Settlement Payout Request
                </button>
              </form>

              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800">Settlement History</div>
                {vendorSettlements.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span className="font-mono">{s.settlementNumber}</span>
                      <span className="font-mono">{formatNPR(s.requestedAmountPaisa)}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Status: <strong>{s.status}</strong> · Payout Ref:{' '}
                      <span className="font-mono">{s.payoutReference || 'Pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASSIGNED ORDERS & MANUAL FULFILLMENT */}
      {activeTab === 'assigned_orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>Execute Manual Order Fulfillment</span>
            </h2>
            <p className="text-xs text-slate-600">
              Only orders with <strong>Approved</strong> manual payment can be fulfilled. Verify the customer’s Game UID, Telecom Mobile Number, or License Email before executing delivery.
            </p>

            <form onSubmit={handleExecuteFulfillment} className="space-y-4">
              <div>
                <label
                  htmlFor="vendor-fulfill-order"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Select Paid Order Eligible for Fulfillment *
                </label>
                <select
                  id="vendor-fulfill-order"
                  value={fulfillOrderId}
                  onChange={(e) => setFulfillOrderId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {eligibleOrders.length === 0 ? (
                    <option value="">No paid orders awaiting fulfillment</option>
                  ) : (
                    eligibleOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} — {o.productSnapshot.title.slice(0, 35)} (
                        {formatNPR(o.finalTotalPaisa)})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="vendor-delivery-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Official Top-Up / Distributor Delivery Reference *
                </label>
                <input
                  id="vendor-delivery-ref"
                  type="text"
                  required
                  value={deliveryReference}
                  onChange={(e) => setDeliveryReference(e.target.value)}
                  placeholder="e.g. FUL-STEAM-2026-9941 or MIDAS-7719"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="vendor-secret-code"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Protected License Key / Redeemable Code (Encrypted with AES-256-GCM)
                </label>
                <input
                  id="vendor-secret-code"
                  type="text"
                  value={secretCodePlain}
                  onChange={(e) => setSecretCodePlain(e.target.value)}
                  placeholder="Optional: Enter voucher PIN or license key for customer vault"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="vendor-delivery-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Customer-Visible Delivery Confirmation Notes *
                </label>
                <textarea
                  id="vendor-delivery-notes"
                  rows={2}
                  required
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="e.g. Credited 660 UC to UID 5182930412 / Delivered Steam $20 code to vault."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                disabled={eligibleOrders.length === 0}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors"
              >
                Mark Order Manually Delivered
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Assigned Vendor Orders & Customer Delivery Identifiers
            </h3>
            <div className="divide-y divide-slate-200">
              {vendorOrders.map((o) => (
                <div key={o.id} className="py-3.5 first:pt-0 last:pb-0 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{o.orderNumber}</span>
                    <span className="font-semibold text-slate-900">
                      {o.orderStatus} (Payment: {o.paymentStatus})
                    </span>
                  </div>
                  <div className="text-slate-800 font-medium">
                    {o.productSnapshot.title} — {o.productSnapshot.variantLabel}
                  </div>
                  <div className="text-slate-600 font-mono">
                    Customer Identifiers: {JSON.stringify(o.customerDeliveryInputs)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT MANAGEMENT & NEW SUBMISSION */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <PackagePlus className="w-4 h-4" />
              <span>Submit New Digital Product for Staff Approval</span>
            </h2>
            <p className="text-xs text-slate-600">
              All submitted products enter <strong>Pending Approval</strong> status until reviewed by a Product Management Admin. Stolen accounts, shared passwords, or unauthorized keys are strictly prohibited.
            </p>

            <form onSubmit={handleSubmitProduct} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="prod-cat"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Category *
                  </label>
                  <select
                    id="prod-cat"
                    value={prodCategoryId}
                    onChange={(e) => setProdCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="prod-subcat"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Subcategory *
                  </label>
                  <input
                    id="prod-subcat"
                    type="text"
                    required
                    value={prodSubcategory}
                    onChange={(e) => setProdSubcategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="prod-title"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Product Name *
                </label>
                <input
                  id="prod-title"
                  type="text"
                  required
                  value={prodTitle}
                  onChange={(e) => setProdTitle(e.target.value)}
                  placeholder="e.g. Mobile Legends 500 Diamonds Authorized Nepal Top-Up"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="prod-price-npr"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Selling Price (NPR) *
                  </label>
                  <input
                    id="prod-price-npr"
                    type="number"
                    required
                    value={prodPriceNPR}
                    onChange={(e) => setProdPriceNPR(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prod-cost-npr"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Sourcing Cost (Restricted)
                  </label>
                  <input
                    id="prod-cost-npr"
                    type="number"
                    value={prodSourcingNPR}
                    onChange={(e) => setProdSourcingNPR(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prod-stock"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Initial Stock *
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="prod-short-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Short Summary *
                </label>
                <input
                  id="prod-short-desc"
                  type="text"
                  required
                  value={prodShortDesc}
                  onChange={(e) => setProdShortDesc(e.target.value)}
                  placeholder="1-line summary shown on product detail view"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Full Product Specification & Delivery Instructions *
                </label>
                <textarea
                  id="prod-desc"
                  rows={2}
                  required
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Detailed description of package, region eligibility, and manual delivery..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prodAuthorizedConfirmed}
                  onChange={(e) => setProdAuthorizedConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  I confirm that our store holds official distributor/reseller authorization for this digital product and that it complies with Nepal law and publisher terms.
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Submit Product for Admin Approval
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Vendor Product Approval Status
            </h3>
            <div className="divide-y divide-slate-200">
              {vendorProducts.map((p) => (
                <div key={p.id} className="py-3.5 first:pt-0 last:pb-0 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{p.title}</span>
                    <span className="font-mono font-bold text-slate-900">{p.approvalStatus}</span>
                  </div>
                  <div className="text-slate-500">
                    {p.categoryName} · {p.subcategory} · Selling: {formatNPR(p.pricePaisa)}
                    {p.sourcingCostPaisa ? ` · Sourcing Cost: ${formatNPR(p.sourcingCostPaisa)}` : ''}
                  </div>
                  {p.rejectionReason && (
                    <div className="text-red-700">Rejection Reason: {p.rejectionReason}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DIGITAL CODE INVENTORY VAULT */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              <span>Add Authorized Digital Code to Vault</span>
            </h2>
            <form onSubmit={handleAddInventory} className="space-y-3.5">
              <div>
                <label
                  htmlFor="inv-prod-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Select Product *
                </label>
                <select
                  id="inv-prod-select"
                  value={invProductId}
                  onChange={(e) => setInvProductId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {vendorProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="inv-batch-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Authorized Distributor Batch Invoice Ref *
                </label>
                <input
                  id="inv-batch-ref"
                  type="text"
                  required
                  value={invBatchRef}
                  onChange={(e) => setInvBatchRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="inv-secret-code"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Redeemable Voucher / License Code (Encrypted on Save) *
                </label>
                <input
                  id="inv-secret-code"
                  type="text"
                  required
                  value={invSecretCode}
                  onChange={(e) => setInvSecretCode(e.target.value)}
                  placeholder="e.g. STEAM-NP-2026-8841"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Encrypt & Store in Inventory Vault
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Protected Digital Inventory Records (Masked)
            </h3>
            <div className="divide-y divide-slate-200">
              {vendorInventory.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{item.productTitle}</div>
                    <div className="text-slate-500 font-mono">
                      Batch: {item.batchReference} · Masked Code: {item.secretCodeMasked}
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 uppercase">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: VENDOR ONBOARDING APPLICATION */}
      {activeTab === 'vendor_onboarding' && (
        <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
            <Store className="w-4 h-4" />
            <span>Apply as a New Verified Nepal Digital Merchant</span>
          </h2>
          <p className="text-xs text-slate-600">
            New vendor applications enter <strong>Pending Review</strong> status and require approval from the Vendor Verification Admin before selling functions are unlocked.
          </p>

          <form onSubmit={handleVendorApply} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="app-shop-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Business / Shop Name *
                </label>
                <input
                  id="app-shop-name"
                  type="text"
                  required
                  value={appShopName}
                  onChange={(e) => setAppShopName(e.target.value)}
                  placeholder="e.g. Everest Digital Voucher Pvt. Ltd."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="app-pan-num"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nepal PAN / VAT Number *
                </label>
                <input
                  id="app-pan-num"
                  type="text"
                  required
                  value={appPanNum}
                  onChange={(e) => setAppPanNum(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="app-reg-num"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Company Registration (OCR / Cottage) *
                </label>
                <input
                  id="app-reg-num"
                  type="text"
                  required
                  value={appRegNum}
                  onChange={(e) => setAppRegNum(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="app-city"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  City / Municipality *
                </label>
                <input
                  id="app-city"
                  type="text"
                  required
                  value={appCity}
                  onChange={(e) => setAppCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="app-auth-stmt"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Distributor / Reseller Authorization Declaration *
              </label>
              <textarea
                id="app-auth-stmt"
                rows={2}
                required
                value={appAuthStatement}
                onChange={(e) => setAppAuthStatement(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Submit Vendor Application for Verification
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
