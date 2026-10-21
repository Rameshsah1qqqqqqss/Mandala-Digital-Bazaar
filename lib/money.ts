/**
 * Monetary Calculations & State Machine Validation Engine
 * All financial calculations use integer minor units (Paisa: 1 NPR = 100 Paisa)
 * to eliminate JavaScript IEEE-754 floating-point rounding errors.
 */

export const PAISA_PER_NPR = 100;

export function nprToPaisa(nprAmount: number): number {
  if (!Number.isFinite(nprAmount) || nprAmount < 0) {
    throw new Error('Invalid monetary amount in NPR');
  }
  return Math.round(nprAmount * PAISA_PER_NPR);
}

export function paisaToNpr(paisaAmount: number): number {
  if (!Number.isSafeInteger(paisaAmount)) {
    throw new Error('Monetary minor unit (paisa) must be a safe integer');
  }
  return paisaAmount / PAISA_PER_NPR;
}

export function formatNPR(paisaAmount: number): string {
  const npr = Math.round(paisaAmount) / PAISA_PER_NPR;
  const hasSubunit = Math.round(paisaAmount) % PAISA_PER_NPR !== 0;
  return `Rs. ${npr.toLocaleString('en-NP', {
    minimumFractionDigits: hasSubunit ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatKathmanduDateTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date) + ' NPT';
}

export interface PromotionRuleInput {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number; // percentage (1..100) or fixed paisa amount
  minOrderPaisa: number;
  maxDiscountPaisa: number;
  firstOrderOnly: boolean;
  applicableCategoryId?: string;
  applicableVendorId?: string;
  applicableProductId?: string;
  startsAt: string;
  expiresAt: string;
  totalUsageLimit: number;
  currentUsageCount: number;
  perCustomerLimit: number;
  isActive: boolean;
}

export interface CheckoutCalculationInput {
  unitPricePaisa: number;
  quantity: number;
  serviceFeeBasisPoints?: number; // e.g., 0 for standard digital goods
  promo?: PromotionRuleInput | null;
  customerPriorOrderCount?: number;
  customerPromoRedemptionCount?: number;
  categoryId?: string;
  vendorId?: string;
  productId?: string;
  now?: Date;
}

export interface CheckoutCalculationResult {
  subtotalPaisa: number;
  discountPaisa: number;
  serviceFeePaisa: number;
  finalTotalPaisa: number;
  promoApplied: boolean;
  promoRejectionReason?: string;
}

export function calculateCheckoutTotals(input: CheckoutCalculationInput): CheckoutCalculationResult {
  if (!Number.isSafeInteger(input.unitPricePaisa) || input.unitPricePaisa <= 0) {
    throw new Error('Unit price in paisa must be a positive integer');
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 50) {
    throw new Error('Quantity must be an integer between 1 and 50');
  }

  const subtotalPaisa = input.unitPricePaisa * input.quantity;
  let discountPaisa = 0;
  let promoApplied = false;
  let promoRejectionReason: string | undefined;

  if (input.promo) {
    const promo = input.promo;
    const now = input.now || new Date();
    const startsAt = new Date(promo.startsAt);
    const expiresAt = new Date(promo.expiresAt);

    if (!promo.isActive) {
      promoRejectionReason = 'Promotion is inactive.';
    } else if (now < startsAt) {
      promoRejectionReason = 'Promotion has not started yet.';
    } else if (now > expiresAt) {
      promoRejectionReason = 'Promotion has expired.';
    } else if (promo.totalUsageLimit > 0 && promo.currentUsageCount >= promo.totalUsageLimit) {
      promoRejectionReason = 'Promotion total usage limit has been reached.';
    } else if (
      promo.perCustomerLimit > 0 &&
      (input.customerPromoRedemptionCount || 0) >= promo.perCustomerLimit
    ) {
      promoRejectionReason = 'You have already reached the per-customer redemption limit for this promotion.';
    } else if (promo.firstOrderOnly && (input.customerPriorOrderCount || 0) > 0) {
      promoRejectionReason = 'Promotion is valid only on a customer’s first order.';
    } else if (subtotalPaisa < promo.minOrderPaisa) {
      promoRejectionReason = `Minimum order of ${formatNPR(promo.minOrderPaisa)} required for this promo code.`;
    } else if (promo.applicableCategoryId && promo.applicableCategoryId !== input.categoryId) {
      promoRejectionReason = 'Promotion does not apply to this product category.';
    } else if (promo.applicableVendorId && promo.applicableVendorId !== input.vendorId) {
      promoRejectionReason = 'Promotion does not apply to this vendor.';
    } else if (promo.applicableProductId && promo.applicableProductId !== input.productId) {
      promoRejectionReason = 'Promotion does not apply to this product.';
    } else {
      if (promo.discountType === 'percentage') {
        const rawDiscount = Math.floor((subtotalPaisa * promo.discountValue) / 100);
        discountPaisa =
          promo.maxDiscountPaisa > 0 ? Math.min(rawDiscount, promo.maxDiscountPaisa) : rawDiscount;
      } else {
        discountPaisa =
          promo.maxDiscountPaisa > 0
            ? Math.min(promo.discountValue, promo.maxDiscountPaisa)
            : promo.discountValue;
      }
      discountPaisa = Math.min(discountPaisa, subtotalPaisa);
      promoApplied = discountPaisa > 0;
    }
  }

  const discountedSubtotal = subtotalPaisa - discountPaisa;
  const feeBps = input.serviceFeeBasisPoints || 0;
  const serviceFeePaisa = Math.floor((discountedSubtotal * feeBps) / 10000);
  const finalTotalPaisa = discountedSubtotal + serviceFeePaisa;

  return {
    subtotalPaisa,
    discountPaisa,
    serviceFeePaisa,
    finalTotalPaisa,
    promoApplied,
    promoRejectionReason,
  };
}

export interface CommissionBreakdown {
  grossAmountPaisa: number;
  discountPaisa: number;
  netCollectedPaisa: number;
  commissionRatePercent: number;
  marketplaceCommissionPaisa: number;
  vendorNetEarningPaisa: number;
}

/**
 * Calculates Marketplace Commission & Vendor Net Earnings using integer paisa math.
 * Commission is calculated on the gross item value, and platform-funded vs vendor-funded
 * discounts are reconciled cleanly so Gross - Discount = Marketplace Revenue + Vendor Earnings.
 */
export function calculateCommissionBreakdown(
  grossAmountPaisa: number,
  discountPaisa: number,
  commissionRatePercent: number
): CommissionBreakdown {
  if (commissionRatePercent < 0 || commissionRatePercent > 50) {
    throw new Error('Commission rate must be between 0% and 50%');
  }
  const netCollectedPaisa = Math.max(0, grossAmountPaisa - discountPaisa);
  const marketplaceCommissionPaisa = Math.round(
    (netCollectedPaisa * Math.round(commissionRatePercent * 100)) / 10000
  );
  const vendorNetEarningPaisa = netCollectedPaisa - marketplaceCommissionPaisa;

  return {
    grossAmountPaisa,
    discountPaisa,
    netCollectedPaisa,
    commissionRatePercent,
    marketplaceCommissionPaisa,
    vendorNetEarningPaisa,
  };
}

export type OrderStatus =
  | 'Pending Payment'
  | 'Payment Under Review'
  | 'Paid'
  | 'Processing'
  | 'Awaiting Fulfillment'
  | 'Partially Fulfilled'
  | 'Delivered'
  | 'Completed'
  | 'Cancellation Requested'
  | 'Cancelled'
  | 'Refund Requested'
  | 'Refunded'
  | 'Disputed';

export type PaymentStatus =
  | 'Unpaid'
  | 'Payment Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Expired'
  | 'Refund Requested'
  | 'Refund Approved'
  | 'Refund Processing'
  | 'Refunded';

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Pending Payment': ['Payment Under Review', 'Cancelled'],
  'Payment Under Review': ['Paid', 'Awaiting Fulfillment', 'Pending Payment', 'Cancelled'],
  Paid: ['Processing', 'Awaiting Fulfillment', 'Refund Requested', 'Cancelled'],
  Processing: ['Awaiting Fulfillment', 'Delivered', 'Refund Requested', 'Disputed'],
  'Awaiting Fulfillment': ['Processing', 'Partially Fulfilled', 'Delivered', 'Refund Requested', 'Cancelled'],
  'Partially Fulfilled': ['Delivered', 'Refund Requested', 'Disputed'],
  Delivered: ['Completed', 'Refund Requested', 'Disputed'],
  Completed: ['Refund Requested', 'Disputed'],
  'Cancellation Requested': ['Cancelled', 'Awaiting Fulfillment'],
  Cancelled: [],
  'Refund Requested': ['Refunded', 'Completed', 'Delivered', 'Disputed'],
  Refunded: [],
  Disputed: ['Refunded', 'Completed', 'Delivered'],
};

export function validateOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
  paymentStatus: PaymentStatus
): { valid: boolean; reason?: string } {
  const fulfillmentStatuses: OrderStatus[] = [
    'Paid',
    'Processing',
    'Awaiting Fulfillment',
    'Partially Fulfilled',
    'Delivered',
    'Completed',
  ];

  if (
    fulfillmentStatuses.includes(nextStatus) &&
    paymentStatus !== 'Approved' &&
    paymentStatus !== 'Refund Requested' &&
    paymentStatus !== 'Refund Approved'
  ) {
    return {
      valid: false,
      reason: `Cannot transition order to "${nextStatus}" while payment status is "${paymentStatus}". Payment must be Approved first.`,
    };
  }

  const allowedNext = VALID_ORDER_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(nextStatus)) {
    return {
      valid: false,
      reason: `Invalid order status transition from "${currentStatus}" to "${nextStatus}".`,
    };
  }

  return { valid: true };
}

/**
 * Normalizes bank/wallet transaction references so duplicate submission tricks
 * (e.g. extra spaces, hyphens, lowercase/uppercase variations) are blocked by unique index.
 */
export function normalizePaymentReference(rawReference: string): string {
  return rawReference
    .trim()
    .toUpperCase()
    .replace(/[\s\-_./]+/g, '');
}
