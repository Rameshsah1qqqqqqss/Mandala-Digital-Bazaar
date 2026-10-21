import React, { useState } from 'react';
import {
  KeyRound,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Upload,
  FileCheck,
  MessageSquare,
  RotateCcw,
  Shield,
  Bookmark,
  Bell,
} from 'lucide-react';
import { BootstrapPayload, ProductClient } from '../types';
import { formatNPR, formatKathmanduDateTime } from '../../lib/money';

interface CustomerDashboardProps {
  data: BootstrapPayload;
  onRefresh: () => Promise<void>;
  onSelectProduct: (product: ProductClient) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type CustomerTab =
  | 'overview_orders'
  | 'payments'
  | 'digital_vault'
  | 'kyc'
  | 'support_refunds'
  | 'security_activity';

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  data,
  onRefresh,
  onSelectProduct,
  notify,
}) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>('overview_orders');

  // Manual Payment Submission State
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<string>(
    data.orders.find((o) => o.paymentStatus === 'Unpaid' || o.paymentStatus === 'Rejected')?.id ||
      data.orders[0]?.id ||
      ''
  );
  const [txnRef, setTxnRef] = useState('');
  const [senderAccount, setSenderAccount] = useState('+977-9841234567');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [receiptFile, setReceiptFile] = useState('nepalpay_qr_receipt.jpg');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Revealed secret codes map (orderId -> plainCode)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});

  // KYC Form State
  const existingKyc = data.kycApplications.find((k) => k.userId === data.currentUser.id);
  const [kycLegalName, setKycLegalName] = useState(
    existingKyc?.legalName || data.currentUser.fullName
  );
  const [kycDob, setKycDob] = useState(existingKyc?.dateOfBirth || '1998-04-14');
  const [kycDistrict, setKycDistrict] = useState(existingKyc?.district || 'Kathmandu');
  const [kycAddress, setKycAddress] = useState(
    existingKyc?.municipalityAddress || data.currentUser.addressLine || 'Kathmandu-4, Baluwatar'
  );
  const [kycDocType, setKycDocType] = useState<
    'Nepali Citizenship Certificate' | 'National Identity Card (NID)' | 'Nepali Passport'
  >(existingKyc?.documentType || 'Nepali Citizenship Certificate');
  const [kycDocNumber, setKycDocNumber] = useState('27-01-75-04918');
  const [kycFrontFile, setKycFrontFile] = useState('citizenship_front_scan.jpg');

  // Support & Refund State
  const [ticketOrderNum, setTicketOrderNum] = useState(data.orders[0]?.orderNumber || '');
  const [ticketCategory, setTicketCategory] = useState<
    | 'Payment Verification'
    | 'Order Delivery Delay'
    | 'Invalid Code / Top-Up Issue'
    | 'KYC Verification'
    | 'Vendor Inquiry'
    | 'General Support'
  >('Payment Verification');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [refundOrderId, setRefundOrderId] = useState(
    data.orders.find((o) => o.paymentStatus === 'Approved')?.id || ''
  );
  const [refundReason, setRefundReason] = useState('');

  const customerOrders = data.orders.filter((o) => o.customerId === data.currentUser.id);
  const customerPayments = data.payments.filter((p) => p.customerId === data.currentUser.id);
  const customerFulfillments = data.fulfillments.filter(
    (f) => f.customerId === data.currentUser.id
  );
  const savedProducts = data.products.filter((p) =>
    data.currentUser.savedProductIds.includes(p.id)
  );

  async function handleSubmitPaymentProof(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderForPayment) {
      notify('Select an order first.', 'error');
      return;
    }
    setSubmittingPayment(true);
    try {
      const res = await fetch('/api/payments/submit-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderForPayment,
          transactionReference: txnRef,
          senderPhoneOrAccount: senderAccount,
          customerRemarks: paymentRemarks,
          receiptFilename: receiptFile,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Payment submission failed');
      notify('Payment reference submitted and queued for Payment Admin verification.', 'success');
      setTxnRef('');
      setPaymentRemarks('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit payment proof', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleRevealSecret(orderId: string) {
    try {
      const res = await fetch('/api/orders/reveal-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reveal secret');
      setRevealedSecrets((prev) => ({ ...prev, [orderId]: json.plainSecretCode }));
      notify('Protected delivery code decrypted and logged in Audit Trail.', 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to reveal secret', 'error');
    }
  }

  async function handleConfirmReceipt(orderId: string) {
    try {
      const res = await fetch('/api/orders/confirm-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to confirm receipt');
      notify('Order marked Completed. Thank you for confirming delivery.', 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error confirming receipt', 'error');
    }
  }

  async function handleSubmitKyc(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/kyc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: kycLegalName,
          dateOfBirth: kycDob,
          district: kycDistrict,
          municipalityAddress: kycAddress,
          documentType: kycDocType,
          documentNumberPlain: kycDocNumber,
          frontFilename: kycFrontFile,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'KYC submission failed');
      notify('KYC verification submitted to private encrypted storage.', 'success');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit KYC', 'error');
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: ticketOrderNum,
          category: ticketCategory,
          priority: 'medium',
          subject: ticketSubject,
          message: ticketMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to open ticket');
      notify(`Support Ticket ${json.ticket.ticketNumber} created.`, 'success');
      setTicketSubject('');
      setTicketMessage('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create ticket', 'error');
    }
  }

  async function handleRequestRefund(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/refunds/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: refundOrderId,
          reason: refundReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to request refund');
      notify(`Refund Request ${json.refund.refundNumber} submitted for review.`, 'success');
      setRefundReason('');
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Refund request error', 'error');
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <div className="text-xs text-slate-500">
            <span>Customer Account Hub</span>
            <span className="mx-2">·</span>
            <span>{data.currentUser.email}</span>
            <span className="mx-2">·</span>
            <span>{data.currentUser.mobileNumber}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 font-display">
            Namaste, {data.currentUser.fullName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage your NPR digital orders, submit manual payment references, reveal encrypted voucher keys, and track KYC verification.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div>
            <div className="text-xs text-slate-500">Total Orders</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {customerOrders.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">KYC Status</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">
              {data.currentUser.kycStatus}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Deliveries</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">
              {customerFulfillments.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Saved Items</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {savedProducts.length}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Segmented Tab Bar */}
      <div
        role="tablist"
        aria-label="Customer Dashboard Sections"
        className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl"
      >
        {(
          [
            { id: 'overview_orders', label: 'My Orders & Timeline' },
            { id: 'payments', label: 'Manual Payment Proof' },
            { id: 'digital_vault', label: 'Digital Purchases & Secret Keys' },
            { id: 'kyc', label: 'Identity KYC Verification' },
            { id: 'support_refunds', label: 'Support Tickets & Refunds' },
            { id: 'security_activity', label: 'Saved, Promos & Login Security' },
          ] as Array<{ id: CustomerTab; label: string }>
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

      {/* TAB 1: MY ORDERS & TIMELINE */}
      {activeTab === 'overview_orders' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  My Marketplace Orders (Immutable NPR Purchase Snapshots)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every order locks the product price, variant, and fulfillment SLA at purchase time.
                </p>
              </div>
            </div>

            {customerOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                You have not placed any digital orders yet. Browse the catalog to place your first order.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {customerOrders.map((order) => (
                  <div key={order.id} className="p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-900">
                            {order.orderNumber}
                          </span>
                          <span>·</span>
                          <span>{formatKathmanduDateTime(order.createdAt)}</span>
                          <span>·</span>
                          <span>Vendor: {order.vendorName}</span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 mt-1">
                          {order.productSnapshot.title} — {order.productSnapshot.variantLabel} (x
                          {order.quantity})
                        </h3>
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(order.customerDeliveryInputs).map(([k, v]) => (
                            <span key={k}>
                              <strong className="font-medium text-slate-700">{k}:</strong>{' '}
                              <span className="font-mono">{v}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-left md:text-right shrink-0">
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                          {formatNPR(order.finalTotalPaisa)}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Order: <strong className="text-slate-900">{order.orderStatus}</strong> ·
                          Payment: <strong className="text-slate-900">{order.paymentStatus}</strong>
                        </div>
                        {(order.paymentStatus === 'Unpaid' ||
                          order.paymentStatus === 'Rejected') && (
                          <button
                            onClick={() => {
                              setSelectedOrderForPayment(order.id);
                              setActiveTab('payments');
                            }}
                            className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg transition-colors whitespace-nowrap"
                          >
                            Submit Manual Payment Proof
                          </button>
                        )}
                        {order.orderStatus === 'Delivered' && (
                          <button
                            onClick={() => handleConfirmReceipt(order.id)}
                            className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                          >
                            Confirm Delivery Receipt
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Order Timeline */}
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Validated Order & Verification Timeline
                      </div>
                      <div className="space-y-2">
                        {order.timeline.map((step, idx) => (
                          <div
                            key={idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-1"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{step.status}</span>
                              <span className="mx-1.5">·</span>
                              <span>{step.note}</span>
                            </div>
                            <div className="text-slate-400 font-mono shrink-0">
                              {formatKathmanduDateTime(step.timestamp)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL PAYMENT PROOF SUBMISSION */}
      {activeTab === 'payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Submit Manual Payment Reference & Evidence
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Transfer the exact NPR total using ConnectIPS, NepalPay QR, eSewa, or Khalti. Duplicate transaction references are blocked by unique database constraints.
              </p>
            </div>

            <form onSubmit={handleSubmitPaymentProof} className="space-y-4">
              <div>
                <label
                  htmlFor="payment-order-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Select Order to Pay
                </label>
                <select
                  id="payment-order-select"
                  value={selectedOrderForPayment}
                  onChange={(e) => setSelectedOrderForPayment(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {customerOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} — {o.productSnapshot.title.slice(0, 36)} (
                      {formatNPR(o.finalTotalPaisa)}) [{o.paymentStatus}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="payment-txn-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Official Bank / QR / Wallet Transaction Reference ID *
                </label>
                <input
                  id="payment-txn-ref"
                  type="text"
                  required
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  placeholder="e.g. FONEPAY-2026-884920 or CIPS-991827"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="payment-sender-acct"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Sender Mobile / Bank Account *
                  </label>
                  <input
                    id="payment-sender-acct"
                    type="text"
                    required
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder="+977-9841XXXXXX"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="payment-receipt-file"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Private Receipt Evidence Filename *
                  </label>
                  <input
                    id="payment-receipt-file"
                    type="text"
                    required
                    value={receiptFile}
                    onChange={(e) => setReceiptFile(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="payment-remarks"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Remarks / Transfer Notes
                </label>
                <input
                  id="payment-remarks"
                  type="text"
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  placeholder="Paid exact NPR total with Order Number in remarks"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={submittingPayment}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {submittingPayment
                    ? 'Submitting Reference...'
                    : 'Submit Payment Reference for Admin Verification'}
                </span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Enabled Nepal Manual Payment Channels
              </h3>
              <div className="divide-y divide-slate-200">
                {data.paymentMethods
                  .filter((pm) => pm.isEnabled)
                  .map((pm) => (
                    <div key={pm.code} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          {pm.displayName}
                        </span>
                        <span className="text-xs font-mono text-slate-600">
                          {pm.accountNumberOrId}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {pm.bankOrProviderName} · Account Name: {pm.accountName}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{pm.instructions}</p>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-display">
                My Payment Verification History
              </h3>
              <div className="divide-y divide-slate-200">
                {customerPayments.map((pay) => (
                  <div key={pay.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-mono font-semibold text-slate-900">
                        {pay.orderNumber} · {formatNPR(pay.expectedAmountPaisa)}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {pay.paymentMethodName} · Ref:{' '}
                        <span className="font-mono">{pay.transactionReferenceRaw || 'Not submitted'}</span>
                      </div>
                      {pay.reviewDecisionReason && (
                        <div className="text-slate-600 mt-0.5">
                          Reviewer Note: {pay.reviewDecisionReason}
                        </div>
                      )}
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">{pay.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DIGITAL PURCHASES & ENCRYPTED SECRET VAULT */}
      {activeTab === 'digital_vault' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              My Digital Deliveries & Encrypted Secret Code Vault
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Secret gift card PINs and software license keys are encrypted at rest with AES-256-GCM and masked in ordinary responses. Click “Reveal Protected Code” to decrypt on-demand.
            </p>
          </div>

          {customerFulfillments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No fulfilled deliveries yet. Once your payment is verified and manually fulfilled, delivery records appear here.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {customerFulfillments.map((ful) => (
                <div
                  key={ful.id}
                  className="py-5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">
                        {ful.orderNumber}
                      </span>
                      <span className="mx-2">·</span>
                      <span>Delivery Ref: {ful.deliveryReference}</span>
                      <span className="mx-2">·</span>
                      <span>{formatKathmanduDateTime(ful.deliveredAt)}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{ful.deliveryNotes}</div>
                    <div className="text-xs text-slate-500">
                      Fulfilled by: {ful.fulfilledByName} · Status: {ful.status}
                    </div>
                  </div>

                  {ful.hasProtectedSecret && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="px-3.5 py-2 bg-slate-900 text-amber-300 font-mono text-xs rounded-lg">
                        {revealedSecrets[ful.orderId] || ful.secretCodeMasked || '••••-••••-••••'}
                      </div>
                      {!revealedSecrets[ful.orderId] && (
                        <button
                          onClick={() => handleRevealSecret(ful.orderId)}
                          className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Reveal Protected Code</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: IDENTITY KYC VERIFICATION */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Submit Nepal Identity KYC Verification
            </h2>
            <p className="text-xs text-slate-600">
              Standard orders under Rs. 15,000 do not require KYC. High-value orders (Rs. 15,000+) require verified Nepali Citizenship, National ID (NID), or Passport. Documents are stored in private storage and accessible only via short-lived signed links.
            </p>

            <form onSubmit={handleSubmitKyc} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kyc-legal-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Full Legal Name (As on Document) *
                  </label>
                  <input
                    id="kyc-legal-name"
                    type="text"
                    required
                    value={kycLegalName}
                    onChange={(e) => setKycLegalName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="kyc-dob"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Date of Birth *
                  </label>
                  <input
                    id="kyc-dob"
                    type="date"
                    required
                    value={kycDob}
                    onChange={(e) => setKycDob(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kyc-doc-type"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Acceptable Nepal Identity Document *
                  </label>
                  <select
                    id="kyc-doc-type"
                    value={kycDocType}
                    onChange={(e) =>
                      setKycDocType(e.target.value as typeof kycDocType)
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Nepali Citizenship Certificate">
                      Nepali Citizenship Certificate
                    </option>
                    <option value="National Identity Card (NID)">
                      National Identity Card (NID)
                    </option>
                    <option value="Nepali Passport">Nepali Passport</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="kyc-doc-num"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Identity Document Number *
                  </label>
                  <input
                    id="kyc-doc-num"
                    type="text"
                    required
                    value={kycDocNumber}
                    onChange={(e) => setKycDocNumber(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kyc-district"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Issued District (Nepal) *
                  </label>
                  <input
                    id="kyc-district"
                    type="text"
                    required
                    value={kycDistrict}
                    onChange={(e) => setKycDistrict(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="kyc-front-file"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Document Scan Filename *
                  </label>
                  <input
                    id="kyc-front-file"
                    type="text"
                    required
                    value={kycFrontFile}
                    onChange={(e) => setKycFrontFile(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="kyc-address"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Municipality & Ward Permanent Address *
                </label>
                <input
                  id="kyc-address"
                  type="text"
                  required
                  value={kycAddress}
                  onChange={(e) => setKycAddress(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <FileCheck className="w-4 h-4" />
                <span>Submit KYC Application to Private Storage</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Current KYC Verification Record
            </h3>
            {existingKyc ? (
              <div className="space-y-3 text-sm">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Verification Status</span>
                    <span className="font-semibold text-slate-900">{existingKyc.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Legal Name</span>
                    <span className="font-medium text-slate-900">{existingKyc.legalName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Document Type</span>
                    <span className="text-slate-800">{existingKyc.documentType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Masked Document No.</span>
                    <span className="font-mono text-slate-800">
                      {existingKyc.documentNumberMasked}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Private Storage Key</span>
                    <span className="font-mono text-xs text-slate-600 truncate max-w-[240px]">
                      {existingKyc.frontDocumentStorageKey}
                    </span>
                  </div>
                  {existingKyc.reviewNotes && (
                    <div className="pt-2 border-t border-slate-200 text-xs text-slate-700">
                      <strong>Reviewer Decision Note:</strong> {existingKyc.reviewNotes}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No KYC application submitted yet. Use the form on the left to submit your Nepali identity document.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SUPPORT TICKETS & REFUNDS */}
      {activeTab === 'support_refunds' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>Open a Customer Support Ticket</span>
            </h2>
            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ticket-cat"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Issue Category
                  </label>
                  <select
                    id="ticket-cat"
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as typeof ticketCategory)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Payment Verification">Payment Verification</option>
                    <option value="Order Delivery Delay">Order Delivery Delay</option>
                    <option value="Invalid Code / Top-Up Issue">Invalid Code / Top-Up Issue</option>
                    <option value="KYC Verification">KYC Verification</option>
                    <option value="General Support">General Support</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="ticket-order"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Related Order Number
                  </label>
                  <input
                    id="ticket-order"
                    type="text"
                    value={ticketOrderNum}
                    onChange={(e) => setTicketOrderNum(e.target.value)}
                    placeholder="ORD-NP-..."
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="ticket-subject"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Subject *
                </label>
                <input
                  id="ticket-subject"
                  type="text"
                  required
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Brief summary of your question or issue"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="ticket-msg"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Message Details *
                </label>
                <textarea
                  id="ticket-msg"
                  rows={3}
                  required
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  placeholder="Describe your order, payment reference, or delivery inquiry..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Submit Support Ticket
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-800">My Support Tickets</div>
              {data.supportTickets.map((t) => (
                <div key={t.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>
                      {t.ticketNumber} · {t.subject}
                    </span>
                    <span>{t.status}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Category: {t.category} · Order: {t.orderNumber || 'N/A'}
                  </div>
                  {t.messages
                    .filter((m) => !m.isInternalNote)
                    .map((m) => (
                      <div key={m.messageId} className="mt-2 pt-2 border-t border-slate-200/70">
                        <strong>{m.senderName}:</strong> {m.body}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              <span>Request Order Refund or Dispute Review</span>
            </h2>
            <p className="text-xs text-slate-600">
              Delivered digital goods are not automatically non-refundable. Submit a refund request if an order is delayed past SLA or a delivered voucher/top-up failed verification.
            </p>
            <form onSubmit={handleRequestRefund} className="space-y-3.5">
              <div>
                <label
                  htmlFor="refund-order-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Select Paid Order *
                </label>
                <select
                  id="refund-order-select"
                  value={refundOrderId}
                  onChange={(e) => setRefundOrderId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {customerOrders
                    .filter((o) => o.paymentStatus === 'Approved')
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} — {o.productSnapshot.title.slice(0, 38)} (
                        {formatNPR(o.finalTotalPaisa)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="refund-reason"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Reason for Refund / Dispute *
                </label>
                <textarea
                  id="refund-reason"
                  rows={3}
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Provide specific details so our Order & Finance Admins can review..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Submit Refund Request
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-800">My Refund Requests</div>
              {data.refunds.length === 0 ? (
                <div className="text-xs text-slate-500">No refund requests submitted.</div>
              ) : (
                data.refunds.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>
                        {r.refundNumber} · {r.orderNumber} ({formatNPR(r.requestedAmountPaisa)})
                      </span>
                      <span>{r.status}</span>
                    </div>
                    <div className="text-slate-600 mt-1">Reason: {r.reason}</div>
                    {r.decisionReason && (
                      <div className="text-slate-700 mt-1">
                        Admin Decision: {r.decisionReason} (Ref: {r.refundReference || 'N/A'})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SAVED PRODUCTS, PROMO CODES, NOTIFICATIONS & SECURITY */}
      {activeTab === 'security_activity' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                <Bookmark className="w-4 h-4" />
                <span>Saved Digital Products ({savedProducts.length})</span>
              </h3>
              {savedProducts.length === 0 ? (
                <p className="text-xs text-slate-500">No saved products yet.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {savedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="py-3 flex items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{p.title}</div>
                        <div className="text-slate-500">
                          {p.vendorName} · {formatNPR(p.pricePaisa)}
                        </div>
                      </div>
                      <button
                        onClick={() => onSelectProduct(p)}
                        className="px-3 py-1.5 font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                      >
                        Order Now
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Eligible Marketplace Promo Codes
              </h3>
              <div className="divide-y divide-slate-200">
                {data.promotions
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <div key={p.code} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-slate-900">{p.code}</span>
                        <span className="mx-2">·</span>
                        <span className="text-slate-600">
                          {p.discountType === 'percentage'
                            ? `${p.discountValue}% Off (Max ${formatNPR(p.maxDiscountPaisa)})`
                            : `${formatNPR(p.discountValue)} Flat Discount`}
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono">
                        Min {formatNPR(p.minOrderPaisa)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span>In-App & Email Notification Log</span>
              </h3>
              <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
                {data.notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">No notifications recorded yet.</p>
                ) : (
                  data.notifications.map((n) => (
                    <div key={n.id} className="py-2.5 text-xs space-y-1">
                      <div className="font-semibold text-slate-900">{n.title}</div>
                      <div className="text-slate-600">{n.body}</div>
                      <div className="text-slate-400 font-mono flex items-center justify-between">
                        <span>{formatKathmanduDateTime(n.createdAt)}</span>
                        <span>
                          Email Mode:{' '}
                          {n.emailDeliveryStatus === 'sent_via_provider'
                            ? 'Sent via SMTP/API'
                            : 'In-App Only (EMAIL_PROVIDER_API_KEY unconfigured)'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Login History & Session Audit</span>
              </h3>
              <div className="divide-y divide-slate-200 max-h-48 overflow-y-auto">
                {data.loginHistory.slice(0, 6).map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-slate-800">{l.email}</span>
                      <span className="mx-1.5">·</span>
                      <span className="text-slate-500">IP {l.ipAddress}</span>
                    </div>
                    <span className="font-mono text-slate-700">{l.outcome}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
