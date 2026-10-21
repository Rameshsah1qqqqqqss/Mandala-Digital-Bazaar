export interface UserAccountClient {
  id: string;
  email: string;
  fullName: string;
  mobileNumber: string;
  roles: string[];
  emailVerified: boolean;
  mobileVerified: boolean;
  mfaEnabled: boolean;
  status: 'active' | 'suspended' | 'deactivated';
  vendorId?: string;
  kycStatus: string;
  country: string;
  province: string;
  city: string;
  addressLine: string;
  savedProductIds: string[];
  notificationPreferences: {
    emailOrderUpdates: boolean;
    emailPromotions: boolean;
    inAppAlerts: boolean;
  };
  createdAt: string;
}

export interface ProductVariantClient {
  variantId: string;
  label: string;
  pricePaisa: number;
  stockCount: number;
  sku: string;
}

export interface ProductClient {
  id: string;
  slug: string;
  vendorId: string;
  vendorName: string;
  categoryId: string;
  categoryName: string;
  subcategory: string;
  title: string;
  shortDescription: string;
  description: string;
  artworkType: 'gaming_topup' | 'gift_card' | 'software_license' | 'telecom_recharge' | 'digital_ebook';
  pricePaisa: number;
  sourcingCostPaisa?: number;
  expectedFulfillmentMinutes: number;
  regionRestriction: string;
  refundEligibility: string;
  productTerms: string;
  resellerAuthorizedConfirmed: boolean;
  authorizationEvidenceKey: string;
  requiredCustomerFields: Array<{
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
    requireConfirmation: boolean;
  }>;
  variants: ProductVariantClient[];
  approvalStatus: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Suspended';
  rejectionReason: string;
  isFeatured: boolean;
  requiresCustomerKyc: boolean;
  createdAt: string;
}

export interface CategoryClient {
  id: string;
  slug: string;
  name: string;
  description: string;
  subcategories: string[];
  commissionRatePercent: number;
  requiredCustomerFields: ProductClient['requiredCustomerFields'];
  isActive: boolean;
}

export interface VendorClient {
  id: string;
  ownerUserId: string;
  shopName: string;
  slug: string;
  businessRegNumber: string;
  panVatNumber: string;
  contactEmail: string;
  contactMobile: string;
  country: string;
  city: string;
  address: string;
  categories: string[];
  resellerAuthorizationStatement: string;
  status: string;
  commissionRatePercent: number;
  pendingEarningsPaisa: number;
  availableEarningsPaisa: number;
  totalSettledPaisa: number;
  bankPayoutDetails: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch: string;
  };
  reviewNotes: string;
  decisionReason: string;
  createdAt: string;
}

export interface PaymentMethodClient {
  code: string;
  displayName: string;
  methodType: 'bank_transfer' | 'nepal_qr' | 'digital_wallet';
  accountName: string;
  accountNumberOrId: string;
  bankOrProviderName: string;
  instructions: string;
  minAmountPaisa: number;
  maxAmountPaisa: number;
  currency: 'NPR';
  isEnabled: boolean;
}

export interface OrderClient {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  vendorId: string;
  vendorName: string;
  productSnapshot: {
    productId: string;
    title: string;
    categoryId: string;
    categoryName: string;
    subcategory: string;
    variantId: string;
    variantLabel: string;
    unitPricePaisa: number;
    refundEligibility: string;
    expectedFulfillmentMinutes: number;
  };
  quantity: number;
  customerDeliveryInputs: Record<string, string>;
  identifierConfirmedByCustomer: boolean;
  subtotalPaisa: number;
  discountPaisa: number;
  promoCodeUsed: string | null;
  serviceFeePaisa: number;
  finalTotalPaisa: number;
  commissionRatePercent: number;
  marketplaceCommissionPaisa: number;
  vendorNetEarningPaisa: number;
  orderStatus: string;
  paymentId: string;
  paymentStatus: string;
  fulfillmentId: string | null;
  timeline: Array<{
    status: string;
    note: string;
    actorName: string;
    timestamp: string;
  }>;
  createdAt: string;
}

export interface PaymentClient {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  expectedAmountPaisa: number;
  currency: 'NPR';
  transactionReferenceRaw: string | null;
  transactionReferenceNormalized: string | null;
  senderPhoneOrAccount: string;
  evidenceStorageKey: string;
  customerRemarks: string;
  status: string;
  reviewedByName: string;
  reviewDecisionReason: string;
  reviewedAt: string | null;
  createdAt: string;
}

export interface FulfillmentClient {
  id: string;
  orderId: string;
  orderNumber: string;
  vendorId: string;
  customerId: string;
  fulfilledByName: string;
  deliveryReference: string;
  deliveryNotes: string;
  internalStaffNotes: string;
  secretCodeMasked: string | null;
  hasProtectedSecret: boolean;
  evidenceStorageKey: string;
  status: string;
  deliveredAt: string;
}

export interface KycApplicationClient {
  id: string;
  userId: string;
  customerEmail: string;
  legalName: string;
  dateOfBirth: string;
  country: string;
  district: string;
  municipalityAddress: string;
  documentType: 'Nepali Citizenship Certificate' | 'National Identity Card (NID)' | 'Nepali Passport';
  documentNumberMasked: string;
  frontDocumentStorageKey: string;
  backDocumentStorageKey: string;
  status: string;
  reviewNotes: string;
  rejectionReason: string;
  reviewedAt: string | null;
  createdAt: string;
}

export interface BootstrapPayload {
  currentUser: UserAccountClient;
  accountsForRoleSwitcher: UserAccountClient[];
  branding: {
    marketplaceName: string;
    shortName: string;
    tagline: string;
    currencyCode: string;
    currencySymbol: string;
    timezone: string;
    contactEmail: string;
    supportPhone: string;
    headquartersAddress: string;
    registrationNumber: string;
    panVatNumber: string;
    promotionalBanner: {
      enabled: boolean;
      text: string;
      code: string;
      linkText: string;
    };
    footer: {
      copyrightText: string;
      complianceNote: string;
      operatingHours: string;
    };
    legalPages: Record<
      string,
      {
        slug: string;
        title: string;
        lastUpdated: string;
        summary: string;
        sections: Array<{ heading: string; body: string }>;
      }
    >;
  };
  categories: CategoryClient[];
  vendors: VendorClient[];
  products: ProductClient[];
  paymentMethods: PaymentMethodClient[];
  orders: OrderClient[];
  payments: PaymentClient[];
  fulfillments: FulfillmentClient[];
  digitalInventory: Array<{
    id: string;
    productId: string;
    productTitle: string;
    variantId: string;
    variantLabel: string;
    vendorId: string;
    batchReference: string;
    secretCodeMasked: string;
    status: string;
    reservedOrderId: string | null;
    expiresAt: string;
    activationNotes: string;
  }>;
  kycApplications: KycApplicationClient[];
  promotions: Array<{
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minOrderPaisa: number;
    maxDiscountPaisa: number;
    firstOrderOnly: boolean;
    totalUsageLimit: number;
    currentUsageCount: number;
    perCustomerLimit: number;
    isActive: boolean;
  }>;
  refunds: Array<{
    id: string;
    refundNumber: string;
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    vendorId: string;
    vendorName: string;
    requestedAmountPaisa: number;
    approvedAmountPaisa: number;
    reason: string;
    status: string;
    decisionReason: string;
    refundReference: string;
    createdAt: string;
  }>;
  ledger: Array<{
    id: string;
    entryNumber: string;
    orderNumber: string;
    vendorId: string | null;
    entryType: string;
    direction: 'credit' | 'debit';
    amountPaisa: number;
    description: string;
    createdAt: string;
  }>;
  settlements: Array<{
    id: string;
    settlementNumber: string;
    vendorId: string;
    vendorName: string;
    requestedAmountPaisa: number;
    bankDetailsSnapshot: string;
    status: string;
    payoutReference: string;
    decisionReason: string;
    createdAt: string;
  }>;
  supportTickets: Array<{
    id: string;
    ticketNumber: string;
    requesterUserId: string;
    requesterName: string;
    requesterRole: string;
    orderNumber: string;
    category: string;
    priority: string;
    subject: string;
    status: string;
    messages: Array<{
      messageId: string;
      senderName: string;
      senderRole: string;
      body: string;
      isInternalNote: boolean;
      createdAt: string;
    }>;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    isRead: boolean;
    emailDeliveryStatus: string;
    createdAt: string;
  }>;
  loginHistory: Array<{
    id: string;
    email: string;
    ipAddress: string;
    outcome: string;
    timestamp: string;
  }>;
  activeSessions: Array<{
    sessionId: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>;
  roles: Array<{
    code: string;
    name: string;
    description: string;
    isSystemRole: boolean;
    isAdminRole: boolean;
    permissions: string[];
  }>;
  auditLogs: Array<{
    id: string;
    eventId: string;
    actorId: string;
    actorName: string;
    actorRoles: string[];
    actionType: string;
    targetRecordType: string;
    targetRecordId: string;
    reason: string;
    beforeSummary: string;
    afterSummary: string;
    correlationId: string;
    createdAt: string;
  }>;
  metrics: {
    totalCustomers: number;
    pendingCustomerKyc: number;
    totalVendors: number;
    approvedVendors: number;
    pendingVendorApprovals: number;
    activeProducts: number;
    pendingProductApprovals: number;
    totalOrders: number;
    paymentsAwaitingReview: number;
    ordersAwaitingFulfillment: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingRefundRequests: number;
    openSupportTickets: number;
    financialSummary: {
      grossSalesPaisa: number;
      totalDiscountsPaisa: number;
      completedRefundsPaisa: number;
      netSalesPaisa: number;
      marketplaceCommissionRevenuePaisa: number;
      vendorNetEarningsTotalPaisa: number;
      outstandingVendorLiabilitiesPaisa: number;
    };
    environmentStatus: {
      mongodbAtlasConfigured: boolean;
      objectStorageConfigured: boolean;
      emailProviderConfigured: boolean;
      futureGateways: Array<{
        providerCode: string;
        displayName: string;
        configured: boolean;
        requiredEnvVars: string[];
        mode: string;
      }>;
      timezone: string;
      currency: string;
    };
    allPermissionsCatalog: Array<{
      code: string;
      module: string;
      action: string;
      description: string;
    }>;
  };
}
