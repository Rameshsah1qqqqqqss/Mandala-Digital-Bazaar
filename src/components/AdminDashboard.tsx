import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileSearch,
  Lock,
  Landmark,
  Users,
  ScrollText,
  Tag,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { BootstrapPayload } from '../types';
import { formatNPR, formatKathmanduDateTime } from '../../lib/money';

interface AdminDashboardProps {
  data: BootstrapPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type AdminSection =
  | 'executive_reports'
  | 'payment_queue'
  | 'fulfillment_queue'
  | 'kyc_queue'
  | 'vendors_products'
  | 'finance_settlements'
  | 'promotions'
  | 'rbac_matrix'
  | 'support_audit_config';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  data,
  onRefresh,
  notify,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>('executive_reports');

  // Payment Review Notes
  const [paymentReasonMap, setPaymentReasonMap] = useState<Record<string, string>>({});

  // Fulfillment Form
  const [adminFulfillOrderId, setAdminFulfillOrderId] = useState(
    data.orders.find((o) => o.orderStatus === 'Awaiting Fulfillment')?.id || ''
  );
  const [adminDeliveryRef, setAdminDeliveryRef] = useState('');
  const [adminDeliveryNotes, setAdminDeliveryNotes] = useState('');
  const [adminSecretCode, setAdminSecretCode] = useState('');

  // KYC Review Reason & Signed URL
  const [kycReasonMap, setKycReasonMap] = useState<Record<string, string>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Vendor & Product Review Reason
  const [vendorReasonMap, setVendorReasonMap] = useState<Record<string, string>>({});
  const [productReasonMap, setProductReasonMap] = useState<Record<string, string>>({});

  // Settlement & Refund Processing
  const [settlementPayoutRef, setSettlementPayoutRef] = useState('NABIL-NEFT-884129');
  const [settlementReason, setSettlementReason] = useState(
    'Verified available vendor balance and executed Nabil Bank transfer.'
  );
  const [refundAdminReason, setRefundAdminReason] = useState(
    'Verified delivery exception and approved customer refund reversal.'
  );

  // Promotions Creation
  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState<'percentage' | 'fixed'>('percentage');
  const [promoVal, setPromoVal] = useState('15');
  const [promoMinNPR, setPromoMinNPR] = useState('1000');
  const [promoMaxNPR, setPromoMaxNPR] = useState('500');
  const [promoLimit, setPromoLimit] = useState('100');

  // Custom RBAC Role Creation & User Role Assignment
  const [customRoleCode, setCustomRoleCode] = useState('');
  const [customRoleName, setCustomRoleName] = useState('');
  const [customRoleDesc, setCustomRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([
    'orders:view_all',
    'payments:view',
    'reports:view',
  ]);
  const [targetUserIdForRole, setTargetUserIdForRole] = useState(
    data.accountsForRoleSwitcher.find((u) => u.id === 'usr_support_admin')?.id ||
      data.accountsForRoleSwitcher[0]?.id ||
      ''
  );
  const [targetRoleToAssign, setTargetRoleToAssign] = useState('support_admin');
  const [roleAssignReason, setRoleAssignReason] = useState(
    'Updated administrative role assignment per governance review.'
  );

  // Support Reply & Audit Search
  const [ticketReplyText, setTicketReplyText] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  const { metrics } = data;
  const fin = metrics.financialSummary;

  async function handleReviewPayment(paymentId: string, decision: 'Approved' | 'Rejected') {
    const reason =
      paymentReasonMap[paymentId] ||
      (decision === 'Approved'
        ? 'Verified settled NPR credit against official merchant bank/QR statement.'
        : 'Transaction reference not found on merchant statement.');
    try {
      const res = await fetch('/api/admin/payments/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, decision, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Payment review failed');
      notify(
        `Payment ${decision}. Order status updated to "${json.order.orderStatus}" and ledger recorded.`,
        'success'
      );
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Payment review failed', 'error');
    }
  }

  async function handleAdminFulfill(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/fulfillment/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: adminFulfillOrderId,
          deliveryReference: adminDeliveryRef,
          deliveryNotes: adminDeliveryNotes,
          secretCodePlain: adminSecretCode || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fulfillment failed');
      notify(
        `Order ${json.order.orderNumber} manually fulfilled (Ref: ${json.fulfillment.deliveryReference}).`,
        'success'
      );
      setAdminDeliveryRef('');
      setAdminDeliveryNotes('');
      setAdminSecretCode('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fulfillment error', 'error');
    }
  }

  async function handleRequestSignedUrl(
    resourceOwnerId: string,
    storageKey: string,
    purpose: 'kyc_review' | 'payment_review' | 'fulfillment_evidence'
  ) {
    try {
      const res = await fetch('/api/storage/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceOwnerId, storageKey, purpose }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Forbidden');
      setSignedUrls((prev) => ({ ...prev, [storageKey]: json.signedUrl }));
      notify('Issued 5-minute HMAC-signed private document link (logged in AuditLogs).', 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Signed URL denied', 'error');
    }
  }

  async function handleReviewKyc(
    kycId: string,
    decision: 'Approved' | 'Rejected' | 'More Information Required'
  ) {
    const reason =
      kycReasonMap[kycId] ||
      (decision === 'Approved'
        ? 'Verified Nepali identity document details against application record.'
        : 'Identity document scan requires clearer front/back image.');
    try {
      const res = await fetch('/api/admin/kyc/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kycId, decision, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'KYC review failed');
      notify(`KYC Application marked "${json.kyc.status}".`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'KYC decision error', 'error');
    }
  }

  async function handleReviewVendor(
    vendorId: string,
    decision: 'Approved' | 'Rejected' | 'Suspended'
  ) {
    const reason =
      vendorReasonMap[vendorId] ||
      `Vendor ${decision} after PAN/VAT and reseller authorization review.`;
    try {
      const res = await fetch('/api/admin/vendors/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, decision, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Vendor review failed');
      notify(`Vendor "${json.vendor.shopName}" marked ${decision}.`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Vendor review error', 'error');
    }
  }

  async function handleReviewProduct(
    productId: string,
    decision: 'Approved' | 'Rejected' | 'Suspended'
  ) {
    const reason =
      productReasonMap[productId] ||
      `Product ${decision} after verifying reseller authorization and NPR pricing.`;
    try {
      const res = await fetch('/api/admin/products/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, decision, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Product review failed');
      notify(`Product "${json.product.title}" marked ${decision}.`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Product review error', 'error');
    }
  }

  async function handleProcessSettlement(
    settlementId: string,
    decision: 'Settlement Paid' | 'Settlement Rejected'
  ) {
    try {
      const res = await fetch('/api/admin/settlements/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementId,
          decision,
          payoutReference: settlementPayoutRef,
          reason: settlementReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Settlement processing failed');
      notify(`Settlement ${json.settlement.settlementNumber} marked "${decision}".`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Settlement error', 'error');
    }
  }

  async function handleReviewRefund(refundId: string, decision: 'Completed' | 'Rejected') {
    try {
      const res = await fetch('/api/admin/refunds/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refundId,
          decision,
          reason: refundAdminReason,
          refundReference: `REV-NP-${Date.now().toString().slice(-6)}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refund review failed');
      notify(`Refund ${json.refund.refundNumber} marked "${decision}".`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Refund review error', 'error');
    }
  }

  async function handleCreatePromo(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode,
          discountType: promoType,
          discountValue: Number(promoVal),
          minOrderNPR: Number(promoMinNPR),
          maxDiscountNPR: Number(promoMaxNPR),
          firstOrderOnly: false,
          totalUsageLimit: Number(promoLimit),
          perCustomerLimit: 2,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Promotion creation failed');
      notify(`Promo Code "${json.promo.code}" created and active.`, 'success');
      setPromoCode('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Promotion error', 'error');
    }
  }

  async function handleCreateCustomRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/rbac/create-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: customRoleCode,
          name: customRoleName,
          description: customRoleDesc,
          permissions: selectedPerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Role creation failed');
      notify(`Custom RBAC role "${json.role.name}" created.`, 'success');
      setCustomRoleCode('');
      setCustomRoleName('');
      setCustomRoleDesc('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Role creation error', 'error');
    }
  }

  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/rbac/assign-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: targetUserIdForRole,
          newRoles: [targetRoleToAssign],
          reason: roleAssignReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Role assignment failed');
      notify(`Updated roles for ${json.user.fullName} to [${json.user.roles.join(', ')}].`, 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Role assignment forbidden', 'error');
    }
  }

  async function handleTogglePaymentMethod(code: string, currentEnabled: boolean) {
    try {
      const res = await fetch('/api/admin/settings/payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, isEnabled: !currentEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update payment method');
      notify(
        `${json.paymentMethod.displayName} is now ${json.paymentMethod.isEnabled ? 'Enabled' : 'Disabled'}.`,
        'success'
      );
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Settings update denied', 'error');
    }
  }

  const filteredAuditLogs = data.auditLogs.filter((log) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      log.actionType.toLowerCase().includes(q) ||
      log.actorName.toLowerCase().includes(q) ||
      log.targetRecordId.toLowerCase().includes(q) ||
      log.reason.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Admin Governance Header */}
      <div className="bg-[#0F172A] text-white rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="text-xs text-slate-300">
            <span>Server-Enforced RBAC Administration Console</span>
            <span className="mx-2">·</span>
            <span>Active Actor: {data.currentUser.fullName}</span>
            <span className="mx-2">·</span>
            <span className="font-mono text-amber-300">
              Roles: [{data.currentUser.roles.join(', ')}]
            </span>
          </div>
          <h1 className="text-2xl font-bold mt-1 font-display">
            Super Admin & Specialized Staff Governance Console
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            All actions validate permissions on the server. Unauthorized actions return HTTP 403 Forbidden and record an immutable security event in AuditLogs.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-800 text-xs">
          <div>
            <div className="text-slate-400">Payments in Queue</div>
            <div className="text-lg font-bold font-mono tabular-nums text-amber-300">
              {metrics.paymentsAwaitingReview}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Awaiting Fulfillment</div>
            <div className="text-lg font-bold font-mono tabular-nums text-sky-300">
              {metrics.ordersAwaitingFulfillment}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Pending KYC</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white">
              {metrics.pendingCustomerKyc}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Pending Vendors/Products</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white">
              {metrics.pendingVendorApprovals + metrics.pendingProductApprovals}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Navigation Bar */}
      <div
        role="tablist"
        aria-label="Admin Console Modules"
        className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl"
      >
        {(
          [
            { id: 'executive_reports', label: 'Executive Metrics & Financial Reports' },
            {
              id: 'payment_queue',
              label: `Payment Verification (${metrics.paymentsAwaitingReview})`,
            },
            {
              id: 'fulfillment_queue',
              label: `Manual Fulfillment (${metrics.ordersAwaitingFulfillment})`,
            },
            { id: 'kyc_queue', label: `Customer KYC Queue (${metrics.pendingCustomerKyc})` },
            {
              id: 'vendors_products',
              label: `Vendors & Products (${
                metrics.pendingVendorApprovals + metrics.pendingProductApprovals
              })`,
            },
            { id: 'finance_settlements', label: 'Ledger, Settlements & Refunds' },
            { id: 'promotions', label: 'Promotions Manager' },
            { id: 'rbac_matrix', label: '12-Role RBAC & Permissions' },
            {
              id: 'support_audit_config',
              label: `Audit Logs (${data.auditLogs.length}) & Config`,
            },
          ] as Array<{ id: AdminSection; label: string }>
        ).map((sec) => (
          <button
            key={sec.id}
            role="tab"
            aria-selected={activeSection === sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeSection === sec.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: EXECUTIVE METRICS & FINANCIAL RECONCILIATION REPORTS */}
      {activeSection === 'executive_reports' && (
        <div className="space-y-6">
          {/* Financial Accounting Breakdown (Never labels Gross Sales as Profit) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Auditable Financial Reconciliation & Marketplace Revenue Report (NPR)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Strict accounting separation between Gross Merchandise Value, Promotional Discounts, Completed Refunds, Net Sales, Marketplace Commission Revenue, and Vendor Liabilities.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 pt-2">
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Gross Sales (GMV)</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatNPR(fin.grossSalesPaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Promo Discounts</div>
                <div className="text-base font-bold font-mono tabular-nums text-amber-700 mt-1">
                  -{formatNPR(fin.totalDiscountsPaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Completed Refunds</div>
                <div className="text-base font-bold font-mono tabular-nums text-red-700 mt-1">
                  -{formatNPR(fin.completedRefundsPaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Net Verified Sales</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatNPR(fin.netSalesPaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Marketplace Revenue</div>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {formatNPR(fin.marketplaceCommissionRevenuePaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Vendor Net Earnings</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatNPR(fin.vendorNetEarningsTotalPaisa)}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Vendor Liabilities</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatNPR(fin.outstandingVendorLiabilitiesPaisa)}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Registered Customers</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {metrics.totalCustomers}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Approved Vendors</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {metrics.approvedVendors} / {metrics.totalVendors}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Active Products</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {metrics.activeProducts}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Orders</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {metrics.totalOrders}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Completed / Delivered</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {metrics.completedOrders}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Open Support Tickets</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {metrics.openSupportTickets}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: MANUAL PAYMENT VERIFICATION QUEUE */}
      {activeSection === 'payment_queue' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Manual Payment Verification Queue (Requires `payments:approve` / `payments:reject`)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Never trust a screenshot alone. Verify the normalized transaction reference and NPR amount against authoritative bank, ConnectIPS, or NepalPay QR merchant records.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {data.payments.map((pay) => (
              <div
                key={pay.id}
                className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-900">{pay.orderNumber}</span>
                    <span>·</span>
                    <span>Customer: {pay.customerName}</span>
                    <span>·</span>
                    <span>Method: {pay.paymentMethodName}</span>
                    <span>·</span>
                    <span>Status: <strong className="text-slate-900">{pay.status}</strong></span>
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                    Expected: {formatNPR(pay.expectedAmountPaisa)} · Submitted Ref:{' '}
                    <span className="text-[#C2410C]">
                      {pay.transactionReferenceRaw || 'Awaiting Customer Submission'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Sender Account/Mobile: <span className="font-mono">{pay.senderPhoneOrAccount || 'N/A'}</span> ·
                    Remarks: {pay.customerRemarks || 'None'}
                  </div>

                  {pay.evidenceStorageKey && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() =>
                          handleRequestSignedUrl(
                            pay.customerId,
                            pay.evidenceStorageKey,
                            'payment_review'
                          )
                        }
                        className="text-xs font-semibold text-slate-900 underline hover:text-[#C2410C]"
                      >
                        Generate 5-Min Signed Receipt Link
                      </button>
                      {signedUrls[pay.evidenceStorageKey] && (
                        <span className="text-xs font-mono text-emerald-700">
                          Signed Token Active: {signedUrls[pay.evidenceStorageKey].slice(0, 48)}...
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {(pay.status === 'Payment Submitted' || pay.status === 'Under Review') && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                    <input
                      type="text"
                      aria-label={`Verification note for ${pay.orderNumber}`}
                      value={paymentReasonMap[pay.id] || ''}
                      onChange={(e) =>
                        setPaymentReasonMap((prev) => ({
                          ...prev,
                          [pay.id]: e.target.value,
                        }))
                      }
                      placeholder="Mandatory verification note / reason..."
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg min-w-[240px]"
                    />
                    <button
                      onClick={() => handleReviewPayment(pay.id, 'Approved')}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Approve Payment
                    </button>
                    <button
                      onClick={() => handleReviewPayment(pay.id, 'Rejected')}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Reject Payment
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: MANUAL FULFILLMENT QUEUE */}
      {activeSection === 'fulfillment_queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Execute Manual Order Fulfillment (`fulfillment:execute`)
            </h2>
            <p className="text-xs text-slate-600">
              Unpaid orders are strictly blocked from fulfillment. Select an order with Approved payment, verify customer identifiers, and record the official delivery reference.
            </p>
            <form onSubmit={handleAdminFulfill} className="space-y-3.5">
              <div>
                <label
                  htmlFor="admin-fulfill-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Select Order *
                </label>
                <select
                  id="admin-fulfill-select"
                  value={adminFulfillOrderId}
                  onChange={(e) => setAdminFulfillOrderId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {data.orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} [{o.orderStatus} / Pay: {o.paymentStatus}] —{' '}
                      {formatNPR(o.finalTotalPaisa)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="admin-deliv-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Official Delivery Reference *
                </label>
                <input
                  id="admin-deliv-ref"
                  type="text"
                  required
                  value={adminDeliveryRef}
                  onChange={(e) => setAdminDeliveryRef(e.target.value)}
                  placeholder="FUL-ADMIN-2026-8812"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="admin-secret-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Protected License Key / Redeemable Code (Encrypted at Rest)
                </label>
                <input
                  id="admin-secret-input"
                  type="text"
                  value={adminSecretCode}
                  onChange={(e) => setAdminSecretCode(e.target.value)}
                  placeholder="Optional voucher PIN or activation key"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="admin-deliv-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Delivery Notes *
                </label>
                <textarea
                  id="admin-deliv-notes"
                  rows={2}
                  required
                  value={adminDeliveryNotes}
                  onChange={(e) => setAdminDeliveryNotes(e.target.value)}
                  placeholder="Manual fulfillment completed after verifying customer UID/Email."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Complete Manual Fulfillment
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Completed Manual Fulfillment Records
            </h3>
            <div className="divide-y divide-slate-200">
              {data.fulfillments.map((f) => (
                <div key={f.id} className="py-3.5 first:pt-0 last:pb-0 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      {f.orderNumber} · Ref: {f.deliveryReference}
                    </span>
                    <span className="font-semibold text-emerald-700">{f.status}</span>
                  </div>
                  <div className="text-slate-700">{f.deliveryNotes}</div>
                  <div className="text-slate-500">
                    Fulfilled by: {f.fulfilledByName} · Masked Secret:{' '}
                    <span className="font-mono">{f.secretCodeMasked || 'None'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: CUSTOMER KYC VERIFICATION QUEUE */}
      {activeSection === 'kyc_queue' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Customer KYC Verification Queue (`kyc:view_documents`, `kyc:approve`, `kyc:reject`)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Finance and Support Admins are blocked from viewing private KYC documents. Only KYC Admins and Super Admin can issue short-lived signed document URLs.
            </p>
          </div>
          <div className="divide-y divide-slate-200">
            {data.kycApplications.map((kyc) => (
              <div
                key={kyc.id}
                className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="font-bold text-slate-900 text-sm">{kyc.legalName}</span>
                    <span>·</span>
                    <span>{kyc.customerEmail}</span>
                    <span>·</span>
                    <span>Status: <strong className="text-slate-900">{kyc.status}</strong></span>
                  </div>
                  <div className="text-slate-700">
                    Document: <strong>{kyc.documentType}</strong> · Masked No:{' '}
                    <span className="font-mono">{kyc.documentNumberMasked}</span> · DOB:{' '}
                    {kyc.dateOfBirth}
                  </div>
                  <div className="text-slate-600">
                    Address: {kyc.municipalityAddress}, {kyc.district}, {kyc.country}
                  </div>
                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() =>
                        handleRequestSignedUrl(
                          kyc.userId,
                          kyc.frontDocumentStorageKey,
                          'kyc_review'
                        )
                      }
                      className="font-semibold text-slate-900 underline hover:text-[#C2410C]"
                    >
                      Issue Signed URL for Private Identity Document
                    </button>
                    {signedUrls[kyc.frontDocumentStorageKey] && (
                      <span className="font-mono text-emerald-700">
                        Authorized: {signedUrls[kyc.frontDocumentStorageKey].slice(0, 50)}...
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <input
                    type="text"
                    aria-label={`KYC review reason for ${kyc.legalName}`}
                    value={kycReasonMap[kyc.id] || ''}
                    onChange={(e) =>
                      setKycReasonMap((prev) => ({ ...prev, [kyc.id]: e.target.value }))
                    }
                    placeholder="Mandatory review or rejection reason..."
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg min-w-[220px]"
                  />
                  <button
                    onClick={() => handleReviewKyc(kyc.id, 'Approved')}
                    className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                  >
                    Approve KYC
                  </button>
                  <button
                    onClick={() => handleReviewKyc(kyc.id, 'Rejected')}
                    className="px-3 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg whitespace-nowrap"
                  >
                    Reject KYC
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: VENDOR & PRODUCT APPROVAL QUEUES */}
      {activeSection === 'vendors_products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Vendor Verification Queue (`vendors:approve` / `vendors:reject`)
            </h2>
            <div className="divide-y divide-slate-200">
              {data.vendors.map((v) => (
                <div key={v.id} className="py-4 first:pt-0 last:pb-0 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{v.shopName}</span>
                    <span className="font-mono font-semibold text-slate-900">{v.status}</span>
                  </div>
                  <div className="text-slate-600">
                    {v.panVatNumber} · {v.businessRegNumber} · {v.city}
                  </div>
                  <div className="text-slate-500">{v.resellerAuthorizationStatement}</div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label={`Vendor review reason for ${v.shopName}`}
                      value={vendorReasonMap[v.id] || ''}
                      onChange={(e) =>
                        setVendorReasonMap((prev) => ({ ...prev, [v.id]: e.target.value }))
                      }
                      placeholder="Review reason..."
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg flex-1"
                    />
                    <button
                      onClick={() => handleReviewVendor(v.id, 'Approved')}
                      className="px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewVendor(v.id, 'Suspended')}
                      className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Product Approval Queue (`products:approve` / `products:reject`)
            </h2>
            <div className="divide-y divide-slate-200">
              {data.products.map((p) => (
                <div key={p.id} className="py-4 first:pt-0 last:pb-0 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{p.title}</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {p.approvalStatus}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Vendor: {p.vendorName} · Price:{' '}
                    <span className="font-mono font-semibold">{formatNPR(p.pricePaisa)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label={`Product review reason for ${p.title}`}
                      value={productReasonMap[p.id] || ''}
                      onChange={(e) =>
                        setProductReasonMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      placeholder="Approval / rejection reason..."
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg flex-1"
                    />
                    <button
                      onClick={() => handleReviewProduct(p.id, 'Approved')}
                      className="px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewProduct(p.id, 'Rejected')}
                      className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: LEDGER, SETTLEMENTS & REFUNDS */}
      {activeSection === 'finance_settlements' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Vendor Settlement Payout Requests (`settlements:pay`)
              </h2>
              <div className="divide-y divide-slate-200">
                {data.settlements.map((s) => (
                  <div key={s.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900">
                        {s.settlementNumber} · {s.vendorName}
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatNPR(s.requestedAmountPaisa)}
                      </span>
                    </div>
                    <div className="text-slate-600">{s.bankDetailsSnapshot}</div>
                    <div className="text-slate-500">Status: {s.status}</div>
                    {s.status === 'Settlement Requested' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={settlementPayoutRef}
                          onChange={(e) => setSettlementPayoutRef(e.target.value)}
                          placeholder="Bank Payout Ref..."
                          className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <button
                          onClick={() => handleProcessSettlement(s.id, 'Settlement Paid')}
                          className="px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                        >
                          Mark Settlement Paid
                        </button>
                        <button
                          onClick={() => handleProcessSettlement(s.id, 'Settlement Rejected')}
                          className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Customer Refund & Dispute Queue (`refunds:approve` / `refunds:reject`)
              </h2>
              {data.refunds.length === 0 ? (
                <p className="text-xs text-slate-500">No active refund requests in queue.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {data.refunds.map((r) => (
                    <div key={r.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">
                          {r.refundNumber} · {r.orderNumber} ({formatNPR(r.requestedAmountPaisa)})
                        </span>
                        <span className="font-semibold text-slate-900">{r.status}</span>
                      </div>
                      <div className="text-slate-600">
                        Customer: {r.customerName} · Reason: {r.reason}
                      </div>
                      {r.status === 'Requested' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleReviewRefund(r.id, 'Completed')}
                            className="px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                          >
                            Approve & Reverse Ledger
                          </button>
                          <button
                            onClick={() => handleReviewRefund(r.id, 'Rejected')}
                            className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
                          >
                            Reject Claim
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Immutable Financial Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Immutable Financial Ledger Entries (Idempotent Double-Entry Audit Trail)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Entry #</th>
                    <th className="py-3 px-4 font-semibold">Type</th>
                    <th className="py-3 px-4 font-semibold">Order</th>
                    <th className="py-3 px-4 font-semibold">Description</th>
                    <th className="py-3 px-4 font-semibold text-right">Amount (NPR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.ledger.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {l.entryNumber}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{l.entryType}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {l.orderNumber || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{l.description}</td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                          l.direction === 'debit' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {l.direction === 'debit' ? '-' : '+'}
                        {formatNPR(l.amountPaisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 7: PROMOTIONS MANAGER */}
      {activeSection === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <Tag className="w-4 h-4" />
              <span>Create Promotional Campaign (`promotions:create`)</span>
            </h2>
            <form onSubmit={handleCreatePromo} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="promo-code-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Promo Code *
                  </label>
                  <input
                    id="promo-code-input"
                    type="text"
                    required
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="TIHAR250"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="promo-type-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Discount Type
                  </label>
                  <select
                    id="promo-type-select"
                    value={promoType}
                    onChange={(e) => setPromoType(e.target.value as 'percentage' | 'fixed')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (NPR)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="promo-val"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Value *
                  </label>
                  <input
                    id="promo-val"
                    type="number"
                    required
                    value={promoVal}
                    onChange={(e) => setPromoVal(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="promo-min"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Min Order (NPR)
                  </label>
                  <input
                    id="promo-min"
                    type="number"
                    value={promoMinNPR}
                    onChange={(e) => setPromoMinNPR(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="promo-max"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Max Cap (NPR)
                  </label>
                  <input
                    id="promo-max"
                    type="number"
                    value={promoMaxNPR}
                    onChange={(e) => setPromoMaxNPR(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Create Server-Validated Promotion
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Active Promotional Campaigns & Redemption Counters
            </h3>
            <div className="divide-y divide-slate-200">
              {data.promotions.map((p) => (
                <div key={p.code} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900 text-sm">{p.code}</span>
                    <span className="mx-2">·</span>
                    <span className="text-slate-600">
                      {p.discountType === 'percentage'
                        ? `${p.discountValue}% Off (Cap ${formatNPR(p.maxDiscountPaisa)})`
                        : `${formatNPR(p.discountValue)} Flat Discount`}
                    </span>
                    <div className="text-slate-500 mt-0.5">
                      Min Order: {formatNPR(p.minOrderPaisa)} · Per-Customer Limit:{' '}
                      {p.perCustomerLimit}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="font-semibold text-slate-900">
                      Used: {p.currentUsageCount} / {p.totalUsageLimit}
                    </div>
                    <div className="text-emerald-700">{p.isActive ? 'Active' : 'Disabled'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 8: 12-ROLE RBAC & PERMISSION MATRIX */}
      {activeSection === 'rbac_matrix' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Assign Administrative Role (Super Admin Only + Lockout Protection)
              </h2>
              <form onSubmit={handleAssignRole} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="rbac-user-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Select User / Staff Account
                  </label>
                  <select
                    id="rbac-user-select"
                    value={targetUserIdForRole}
                    onChange={(e) => setTargetUserIdForRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.accountsForRoleSwitcher.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.email}) — Current: [{u.roles.join(', ')}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="rbac-role-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Assign Role
                  </label>
                  <select
                    id="rbac-role-select"
                    value={targetRoleToAssign}
                    onChange={(e) => setTargetRoleToAssign(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {data.roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="rbac-assign-reason"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Audit Reason *
                  </label>
                  <input
                    id="rbac-assign-reason"
                    type="text"
                    required
                    value={roleAssignReason}
                    onChange={(e) => setRoleAssignReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Update User Role Assignment
                </button>
              </form>
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 font-display">
                Create Custom Administrative Role (`roles:create`)
              </h2>
              <form onSubmit={handleCreateCustomRole} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="custom-role-code"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Role Code *
                    </label>
                    <input
                      id="custom-role-code"
                      type="text"
                      required
                      value={customRoleCode}
                      onChange={(e) => setCustomRoleCode(e.target.value)}
                      placeholder="regional_auditor"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-role-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Display Name *
                    </label>
                    <input
                      id="custom-role-name"
                      type="text"
                      required
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      placeholder="Regional Compliance Auditor"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="custom-role-desc"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Role Scope Description *
                  </label>
                  <input
                    id="custom-role-desc"
                    type="text"
                    required
                    value={customRoleDesc}
                    onChange={(e) => setCustomRoleDesc(e.target.value)}
                    placeholder="Read-only compliance review of orders and reports"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Create Custom RBAC Role
                </button>
              </form>
            </div>
          </div>

          {/* All 12 System Roles & Granular Permissions Directory */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Configured RBAC Roles & Granular Permission Boundaries ({data.roles.length} Roles)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.roles.map((r) => (
                <div
                  key={r.code}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{r.name}</span>
                    <span className="font-mono text-slate-500">{r.code}</span>
                  </div>
                  <p className="text-slate-600">{r.description}</p>
                  <div className="pt-1 font-mono text-[11px] text-slate-700">
                    Permissions ({r.permissions.length}):{' '}
                    {r.permissions.slice(0, 5).join(', ')}
                    {r.permissions.length > 5 ? ` +${r.permissions.length - 5} more` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 9: SEARCHABLE AUDIT LOGS, SUPPORT & PLATFORM CONFIGURATION */}
      {activeSection === 'support_audit_config' && (
        <div className="space-y-8">
          {/* Searchable Immutable Audit Logs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  Immutable Security & Administrative Audit Logs ({filteredAuditLogs.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Records every role update, payment decision, KYC review, secret code reveal, and RBAC denial. Ordinary admins cannot edit or delete logs.
                </p>
              </div>
              <input
                type="search"
                aria-label="Filter audit logs"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action, actor, or record ID..."
                className="px-3.5 py-2 text-xs border border-slate-300 rounded-lg min-w-[240px]"
              />
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Event ID</th>
                    <th className="py-2.5 px-4 font-semibold">Actor & Role</th>
                    <th className="py-2.5 px-4 font-semibold">Action Type</th>
                    <th className="py-2.5 px-4 font-semibold">Target</th>
                    <th className="py-2.5 px-4 font-semibold">Reason & State Change</th>
                    <th className="py-2.5 px-4 font-semibold">Timestamp (NPT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-slate-800">{log.eventId}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{log.actorName}</div>
                        <div className="font-mono text-slate-500">[{log.actorRoles.join(',')}]</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {log.actionType}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {log.targetRecordType}:{log.targetRecordId}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        <div>{log.reason}</div>
                        {(log.beforeSummary || log.afterSummary) && (
                          <div className="font-mono text-[11px] text-slate-500">
                            {log.beforeSummary} → {log.afterSummary}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatKathmanduDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Method Configuration & External Integration Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Manual Payment Methods Governance (`payment_methods:manage`)
              </h3>
              <div className="divide-y divide-slate-200">
                {data.paymentMethods.map((pm) => (
                  <div
                    key={pm.code}
                    className="py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{pm.displayName}</div>
                      <div className="text-slate-500 font-mono">
                        {pm.bankOrProviderName} · {pm.accountNumberOrId}
                      </div>
                    </div>
                    <button
                      onClick={() => handleTogglePaymentMethod(pm.code, pm.isEnabled)}
                      className={`px-3 py-1.5 font-semibold rounded-lg transition-colors ${
                        pm.isEnabled
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {pm.isEnabled ? 'Enabled (Click to Disable)' : 'Disabled (Click to Enable)'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Infrastructure & Future Nepal Payment Gateway Readiness
              </h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <span>MongoDB Atlas (`MONGODB_URI`)</span>
                  <span className="font-mono font-semibold">
                    {metrics.environmentStatus.mongodbAtlasConfigured
                      ? 'Connected to MongoDB Atlas Cluster'
                      : 'Mongoose Schema Sandbox Active (Set MONGODB_URI for Atlas)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <span>Private S3 Object Storage (`OBJECT_STORAGE_BUCKET`)</span>
                  <span className="font-mono font-semibold">
                    {metrics.environmentStatus.objectStorageConfigured
                      ? 'S3 Private Bucket Configured'
                      : 'Signed Token Interface Active (Set S3 Env Vars for Production)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <span>Transactional Email (`EMAIL_PROVIDER_API_KEY`)</span>
                  <span className="font-mono font-semibold">
                    {metrics.environmentStatus.emailProviderConfigured
                      ? 'Live Email Provider Active'
                      : 'In-App Notifications Active (Set EMAIL_PROVIDER_API_KEY)'}
                  </span>
                </div>
                <div className="pt-2">
                  <div className="font-semibold text-slate-800 mb-1.5">
                    Provider-Independent Future Nepal Gateway Interfaces:
                  </div>
                  {metrics.environmentStatus.futureGateways.map((gw) => (
                    <div
                      key={gw.providerCode}
                      className="py-1.5 flex items-center justify-between border-b border-slate-100 last:border-0"
                    >
                      <span>{gw.displayName}</span>
                      <span className="font-mono text-slate-600">
                        Manual Verification Active ({gw.requiredEnvVars[0]})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
