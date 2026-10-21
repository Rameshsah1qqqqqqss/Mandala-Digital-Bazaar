import mongoose, { Schema, Model } from 'mongoose';

/**
 * Complete MongoDB Atlas / Mongoose Schema & Index Definitions
 * Covers all 33 domain collections required for Mandala Digital Bazaar (Nepal).
 * Uses integer minor units (paisa) + Decimal128 for monetary integrity,
 * immutable purchase-time snapshots, and strict unique indexes.
 */

// 1. Users
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    roles: { type: [String], default: ['customer'], index: true },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    mfaEnabled: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', 'deactivated'], default: 'active', index: true },
    vendorId: { type: String, index: true },
    kycStatus: {
      type: String,
      enum: [
        'Not Started',
        'Draft',
        'Submitted',
        'Under Review',
        'More Information Required',
        'Approved',
        'Rejected',
        'Expired',
        'Resubmission Required',
      ],
      default: 'Not Started',
    },
  },
  { timestamps: true }
);

// 2. User Profiles
const UserProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    country: { type: String, default: 'Nepal' },
    province: { type: String, default: 'Bagmati Province' },
    city: { type: String, default: 'Kathmandu' },
    addressLine: { type: String, default: '' },
    preferredLanguage: { type: String, default: 'en' },
    notificationPreferences: {
      emailOrderUpdates: { type: Boolean, default: true },
      emailPromotions: { type: Boolean, default: false },
      inAppAlerts: { type: Boolean, default: true },
    },
    savedProductIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

// 3. Authentication Sessions
const AuthSessionSchema = new Schema(
  {
    sessionTokenHash: { type: String, required: true, unique: true, index: true, select: false },
    userId: { type: String, required: true, index: true },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 4. Roles & 5. Permissions & 6. UserRoles
const RoleSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    isSystemRole: { type: Boolean, default: false },
    isAdminRole: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

const PermissionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

const UserRoleAssignmentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    roleCode: { type: String, required: true, index: true },
    assignedByUserId: { type: String, required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);
UserRoleAssignmentSchema.index({ userId: 1, roleCode: 1 }, { unique: true });

// 7. Vendors, 8. VendorApplications, 9. VendorMembers, 10. VendorDocuments
const VendorSchema = new Schema(
  {
    ownerUserId: { type: String, required: true, index: true },
    shopName: { type: String, required: true, unique: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    businessRegNumber: { type: String, required: true },
    panVatNumber: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactMobile: { type: String, required: true },
    country: { type: String, default: 'Nepal' },
    city: { type: String, required: true },
    address: { type: String, required: true },
    categories: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['Draft', 'Pending Review', 'Under Review', 'Approved', 'Rejected', 'Suspended', 'Deactivated'],
      default: 'Pending Review',
      index: true,
    },
    commissionRatePercent: { type: Number, default: 8 },
    pendingEarningsPaisa: { type: Number, default: 0 },
    availableEarningsPaisa: { type: Number, default: 0 },
    totalSettledPaisa: { type: Number, default: 0 },
    bankPayoutDetails: {
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      branch: { type: String, default: '' },
    },
    agreementAcceptedAt: { type: Date, required: true },
    reviewNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

const VendorApplicationSchema = new Schema(
  {
    vendorId: { type: String, required: true, index: true },
    applicantUserId: { type: String, required: true, index: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    shopName: { type: String, required: true },
    businessRegNumber: { type: String, required: true },
    panVatNumber: { type: String, required: true },
    address: { type: String, required: true },
    categories: { type: [String], required: true },
    resellerAuthorizationStatement: { type: String, required: true },
    status: {
      type: String,
      enum: ['Draft', 'Pending Review', 'Under Review', 'Approved', 'Rejected', 'Suspended', 'Deactivated'],
      default: 'Pending Review',
      index: true,
    },
    reviewedByUserId: { type: String, default: null },
    decisionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

const VendorMemberSchema = new Schema(
  {
    vendorId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    memberRole: { type: String, enum: ['owner', 'fulfillment_staff', 'catalog_manager'], default: 'owner' },
  },
  { timestamps: true }
);

const VendorDocumentSchema = new Schema(
  {
    vendorId: { type: String, required: true, index: true },
    documentType: { type: String, enum: ['pan_vat_certificate', 'company_registration', 'distributor_authorization'], required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
  },
  { timestamps: true }
);

// 11. KYC Applications & 12. KYC Documents
const KycApplicationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    legalName: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true },
    country: { type: String, default: 'Nepal' },
    district: { type: String, required: true },
    municipalityAddress: { type: String, required: true },
    documentType: {
      type: String,
      enum: ['Nepali Citizenship Certificate', 'National Identity Card (NID)', 'Nepali Passport'],
      required: true,
    },
    documentNumberMasked: { type: String, required: true },
    documentNumberEncrypted: { type: String, required: true, select: false },
    frontDocumentStorageKey: { type: String, required: true },
    backDocumentStorageKey: { type: String, default: '' },
    status: {
      type: String,
      enum: [
        'Not Started',
        'Draft',
        'Submitted',
        'Under Review',
        'More Information Required',
        'Approved',
        'Rejected',
        'Expired',
        'Resubmission Required',
      ],
      default: 'Submitted',
      index: true,
    },
    assignedReviewerId: { type: String, default: null },
    reviewNotes: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    decisionHistory: {
      type: [
        {
          status: String,
          actorId: String,
          reason: String,
          timestamp: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const KycDocumentSchema = new Schema(
  {
    kycApplicationId: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    side: { type: String, enum: ['front', 'back', 'selfie_note'], default: 'front' },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
  },
  { timestamps: true }
);

// 13. Categories
const CategorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    subcategories: { type: [String], default: [] },
    requiredCustomerFields: {
      type: [
        {
          key: String,
          label: String,
          placeholder: String,
          required: Boolean,
          requireConfirmation: Boolean,
        },
      ],
      default: [],
    },
    commissionRatePercent: { type: Number, default: 8 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// 14. Products, 15. ProductVariants, 16. ProductApprovalHistory, 17. ProductInventory
const ProductSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    vendorId: { type: String, required: true, index: true },
    vendorName: { type: String, required: true },
    categoryId: { type: String, required: true, index: true },
    categoryName: { type: String, required: true },
    subcategory: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, index: true },
    shortDescription: { type: String, required: true },
    description: { type: String, required: true },
    artworkType: {
      type: String,
      enum: ['gaming_topup', 'gift_card', 'software_license', 'telecom_recharge', 'digital_ebook'],
      default: 'gaming_topup',
    },
    pricePaisa: { type: Number, required: true, index: true },
    priceDecimal: { type: Schema.Types.Decimal128, required: false },
    sourcingCostPaisa: { type: Number, default: 0, select: false },
    expectedFulfillmentMinutes: { type: Number, default: 15 },
    regionRestriction: { type: String, default: 'Nepal / Global Authorized' },
    refundEligibility: {
      type: String,
      enum: ['Refundable Before Fulfillment or If Defective', 'Full Verification Guarantee'],
      default: 'Refundable Before Fulfillment or If Defective',
    },
    productTerms: { type: String, required: true },
    resellerAuthorizedConfirmed: { type: Boolean, required: true },
    authorizationEvidenceKey: { type: String, default: '' },
    requiredCustomerFields: {
      type: [
        {
          key: String,
          label: String,
          placeholder: String,
          required: Boolean,
          requireConfirmation: Boolean,
        },
      ],
      default: [],
    },
    variants: {
      type: [
        {
          variantId: String,
          label: String,
          pricePaisa: Number,
          stockCount: Number,
          sku: String,
        },
      ],
      default: [],
    },
    approvalStatus: {
      type: String,
      enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Suspended'],
      default: 'Pending Approval',
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false, index: true },
    requiresCustomerKyc: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ProductApprovalHistorySchema = new Schema(
  {
    productId: { type: String, required: true, index: true },
    actorUserId: { type: String, required: true },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { timestamps: true }
);

const ProductInventorySchema = new Schema(
  {
    productId: { type: String, required: true, index: true },
    variantId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    batchReference: { type: String, required: true },
    secretCodeEncrypted: { type: String, required: true, select: false },
    secretCodeMasked: { type: String, required: true },
    status: { type: String, enum: ['available', 'reserved', 'allocated', 'expired'], default: 'available', index: true },
    reservedOrderId: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null },
    activationNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

// 18. ParentOrders, 19. VendorOrders, 20. OrderItems
const OrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    vendorId: { type: String, required: true, index: true },
    vendorName: { type: String, required: true },
    // Immutable purchase-time product snapshot
    productSnapshot: {
      productId: { type: String, required: true },
      title: { type: String, required: true },
      categoryId: { type: String, required: true },
      categoryName: { type: String, required: true },
      subcategory: { type: String, required: true },
      variantId: { type: String, required: true },
      variantLabel: { type: String, required: true },
      unitPricePaisa: { type: Number, required: true },
      refundEligibility: { type: String, required: true },
      expectedFulfillmentMinutes: { type: Number, required: true },
    },
    quantity: { type: Number, required: true },
    customerDeliveryInputs: { type: Schema.Types.Mixed, default: {} },
    identifierConfirmedByCustomer: { type: Boolean, required: true },
    subtotalPaisa: { type: Number, required: true },
    discountPaisa: { type: Number, default: 0 },
    promoCodeUsed: { type: String, default: null },
    serviceFeePaisa: { type: Number, default: 0 },
    finalTotalPaisa: { type: Number, required: true },
    commissionRatePercent: { type: Number, required: true },
    marketplaceCommissionPaisa: { type: Number, required: true },
    vendorNetEarningPaisa: { type: Number, required: true },
    orderStatus: {
      type: String,
      enum: [
        'Pending Payment',
        'Payment Under Review',
        'Paid',
        'Processing',
        'Awaiting Fulfillment',
        'Partially Fulfilled',
        'Delivered',
        'Completed',
        'Cancellation Requested',
        'Cancelled',
        'Refund Requested',
        'Refunded',
        'Disputed',
      ],
      default: 'Pending Payment',
      index: true,
    },
    paymentId: { type: String, required: true, index: true },
    paymentStatus: {
      type: String,
      enum: [
        'Unpaid',
        'Payment Submitted',
        'Under Review',
        'Approved',
        'Rejected',
        'Expired',
        'Refund Requested',
        'Refund Approved',
        'Refund Processing',
        'Refunded',
      ],
      default: 'Unpaid',
      index: true,
    },
    fulfillmentId: { type: String, default: null },
    timeline: {
      type: [
        {
          status: String,
          note: String,
          actorName: String,
          timestamp: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// 21. PaymentMethods, 22. Payments, 23. PaymentEvidence
const PaymentMethodSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    methodType: { type: String, enum: ['bank_transfer', 'nepal_qr', 'digital_wallet'], required: true },
    accountName: { type: String, required: true },
    accountNumberOrId: { type: String, required: true },
    bankOrProviderName: { type: String, required: true },
    instructions: { type: String, required: true },
    minAmountPaisa: { type: Number, default: 5000 }, // Rs. 50
    maxAmountPaisa: { type: Number, default: 50000000 }, // Rs. 500,000
    currency: { type: String, default: 'NPR' },
    isEnabled: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const PaymentSchema = new Schema(
  {
    orderId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    paymentMethodCode: { type: String, required: true },
    paymentMethodName: { type: String, required: true },
    expectedAmountPaisa: { type: Number, required: true },
    currency: { type: String, default: 'NPR' },
    transactionReferenceRaw: { type: String, default: null },
    // Unique normalized transaction reference prevents duplicate reference reuse across orders
    transactionReferenceNormalized: { type: String, sparse: true, unique: true, index: true },
    senderPhoneOrAccount: { type: String, default: '' },
    evidenceStorageKey: { type: String, default: '' },
    customerRemarks: { type: String, default: '' },
    status: {
      type: String,
      enum: [
        'Unpaid',
        'Payment Submitted',
        'Under Review',
        'Approved',
        'Rejected',
        'Expired',
        'Refund Requested',
        'Refund Approved',
        'Refund Processing',
        'Refunded',
      ],
      default: 'Unpaid',
      index: true,
    },
    reviewedByUserId: { type: String, default: null },
    reviewedByName: { type: String, default: '' },
    reviewDecisionReason: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    idempotencyApprovalKey: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

// 24. FulfillmentRecords
const FulfillmentRecordSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    assignedStaffOrVendorUserId: { type: String, required: true },
    fulfilledByName: { type: String, required: true },
    deliveryReference: { type: String, required: true, unique: true, index: true },
    deliveryNotes: { type: String, required: true },
    internalStaffNotes: { type: String, default: '' },
    secretCodeEncrypted: { type: String, default: null, select: false },
    secretCodeMasked: { type: String, default: null },
    evidenceStorageKey: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Delivered', 'Confirmed By Customer', 'Disputed'], default: 'Delivered' },
    deliveredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 25. RefundRequests
const RefundRequestSchema = new Schema(
  {
    refundNumber: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    requestedAmountPaisa: { type: Number, required: true },
    approvedAmountPaisa: { type: Number, default: 0 },
    reason: { type: String, required: true },
    evidenceStorageKey: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Requested', 'Under Review', 'More Information Required', 'Approved', 'Rejected', 'Processing', 'Completed'],
      default: 'Requested',
      index: true,
    },
    assignedReviewerId: { type: String, default: null },
    decisionReason: { type: String, default: '' },
    refundReference: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 26. Promotions & 27. PromotionRedemptions
const PromotionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    minOrderPaisa: { type: Number, default: 0 },
    maxDiscountPaisa: { type: Number, default: 0 },
    firstOrderOnly: { type: Boolean, default: false },
    applicableCategoryId: { type: String, default: '' },
    applicableVendorId: { type: String, default: '' },
    applicableProductId: { type: String, default: '' },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    totalUsageLimit: { type: Number, default: 100 },
    currentUsageCount: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const PromotionRedemptionSchema = new Schema(
  {
    promotionCode: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    discountPaisa: { type: Number, required: true },
  },
  { timestamps: true }
);

// 28. FinancialLedgerEntries & 29. VendorSettlementRequests
const FinancialLedgerEntrySchema = new Schema(
  {
    entryNumber: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, default: null, index: true },
    orderNumber: { type: String, default: '' },
    vendorId: { type: String, default: null, index: true },
    entryType: {
      type: String,
      enum: [
        'payment_verified',
        'marketplace_commission',
        'vendor_earning_credit',
        'refund_reversal',
        'vendor_settlement_payout',
        'manual_adjustment',
      ],
      required: true,
      index: true,
    },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amountPaisa: { type: Number, required: true },
    currency: { type: String, default: 'NPR' },
    description: { type: String, required: true },
    actorUserId: { type: String, required: true },
  },
  { timestamps: true }
);

const VendorSettlementRequestSchema = new Schema(
  {
    settlementNumber: { type: String, required: true, unique: true, index: true },
    vendorId: { type: String, required: true, index: true },
    vendorName: { type: String, required: true },
    requestedAmountPaisa: { type: Number, required: true },
    bankDetailsSnapshot: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'Settlement Requested',
        'Settlement Under Review',
        'Settlement Approved',
        'Settlement Paid',
        'Settlement Rejected',
      ],
      default: 'Settlement Requested',
      index: true,
    },
    reviewedByUserId: { type: String, default: null },
    payoutReference: { type: String, default: '' },
    decisionReason: { type: String, default: '' },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 30. SupportTickets & 31. SupportMessages
const SupportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    requesterUserId: { type: String, required: true, index: true },
    requesterName: { type: String, required: true },
    requesterRole: { type: String, required: true },
    orderNumber: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Payment Verification', 'Order Delivery Delay', 'Invalid Code / Top-Up Issue', 'KYC Verification', 'Vendor Inquiry', 'General Support'],
      required: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ['Open', 'In Progress', 'Awaiting Customer', 'Escalated', 'Resolved'], default: 'Open', index: true },
    assignedAdminId: { type: String, default: null },
    resolutionSummary: { type: String, default: '' },
    messages: {
      type: [
        {
          messageId: String,
          senderUserId: String,
          senderName: String,
          senderRole: String,
          body: String,
          isInternalNote: Boolean,
          createdAt: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// 32. Notifications
const NotificationSchema = new Schema(
  {
    recipientUserId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, default: 'system' },
    isRead: { type: Boolean, default: false, index: true },
    emailDeliveryStatus: {
      type: String,
      enum: ['sent_via_provider', 'in_app_only_email_unconfigured'],
      default: 'in_app_only_email_unconfigured',
    },
  },
  { timestamps: true }
);

// 33. AuditLogs
const AuditLogSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    actorName: { type: String, required: true },
    actorRoles: { type: [String], required: true },
    actionType: { type: String, required: true, index: true },
    targetRecordType: { type: String, required: true, index: true },
    targetRecordId: { type: String, required: true, index: true },
    reason: { type: String, default: '' },
    beforeSummary: { type: String, default: '' },
    afterSummary: { type: String, default: '' },
    correlationId: { type: String, required: true },
  },
  { timestamps: true }
);

export const Models = {
  User: (mongoose.models.User || mongoose.model('User', UserSchema)) as Model<unknown>,
  UserProfile: (mongoose.models.UserProfile || mongoose.model('UserProfile', UserProfileSchema)) as Model<unknown>,
  AuthSession: (mongoose.models.AuthSession || mongoose.model('AuthSession', AuthSessionSchema)) as Model<unknown>,
  Role: (mongoose.models.Role || mongoose.model('Role', RoleSchema)) as Model<unknown>,
  Permission: (mongoose.models.Permission || mongoose.model('Permission', PermissionSchema)) as Model<unknown>,
  UserRoleAssignment: (mongoose.models.UserRoleAssignment || mongoose.model('UserRoleAssignment', UserRoleAssignmentSchema)) as Model<unknown>,
  Vendor: (mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema)) as Model<unknown>,
  VendorApplication: (mongoose.models.VendorApplication || mongoose.model('VendorApplication', VendorApplicationSchema)) as Model<unknown>,
  VendorMember: (mongoose.models.VendorMember || mongoose.model('VendorMember', VendorMemberSchema)) as Model<unknown>,
  VendorDocument: (mongoose.models.VendorDocument || mongoose.model('VendorDocument', VendorDocumentSchema)) as Model<unknown>,
  KycApplication: (mongoose.models.KycApplication || mongoose.model('KycApplication', KycApplicationSchema)) as Model<unknown>,
  KycDocument: (mongoose.models.KycDocument || mongoose.model('KycDocument', KycDocumentSchema)) as Model<unknown>,
  Category: (mongoose.models.Category || mongoose.model('Category', CategorySchema)) as Model<unknown>,
  Product: (mongoose.models.Product || mongoose.model('Product', ProductSchema)) as Model<unknown>,
  ProductApprovalHistory: (mongoose.models.ProductApprovalHistory || mongoose.model('ProductApprovalHistory', ProductApprovalHistorySchema)) as Model<unknown>,
  ProductInventory: (mongoose.models.ProductInventory || mongoose.model('ProductInventory', ProductInventorySchema)) as Model<unknown>,
  Order: (mongoose.models.Order || mongoose.model('Order', OrderSchema)) as Model<unknown>,
  PaymentMethod: (mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', PaymentMethodSchema)) as Model<unknown>,
  Payment: (mongoose.models.Payment || mongoose.model('Payment', PaymentSchema)) as Model<unknown>,
  FulfillmentRecord: (mongoose.models.FulfillmentRecord || mongoose.model('FulfillmentRecord', FulfillmentRecordSchema)) as Model<unknown>,
  RefundRequest: (mongoose.models.RefundRequest || mongoose.model('RefundRequest', RefundRequestSchema)) as Model<unknown>,
  Promotion: (mongoose.models.Promotion || mongoose.model('Promotion', PromotionSchema)) as Model<unknown>,
  PromotionRedemption: (mongoose.models.PromotionRedemption || mongoose.model('PromotionRedemption', PromotionRedemptionSchema)) as Model<unknown>,
  FinancialLedgerEntry: (mongoose.models.FinancialLedgerEntry || mongoose.model('FinancialLedgerEntry', FinancialLedgerEntrySchema)) as Model<unknown>,
  VendorSettlementRequest: (mongoose.models.VendorSettlementRequest || mongoose.model('VendorSettlementRequest', VendorSettlementRequestSchema)) as Model<unknown>,
  SupportTicket: (mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema)) as Model<unknown>,
  Notification: (mongoose.models.Notification || mongoose.model('Notification', NotificationSchema)) as Model<unknown>,
  AuditLog: (mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema)) as Model<unknown>,
};
