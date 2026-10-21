import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_BRANDING_CONFIG,
  type BrandingConfig,
} from '../config/branding.ts';
import {
  INITIAL_ROLES,
  ALL_PERMISSIONS,
  type RoleDefinition,
  type PermissionCode,
  hasPermission,
  canModifyRoleAssignment,
} from '../config/permissions.ts';
import {
  nprToPaisa,
  formatNPR,
  calculateCheckoutTotals,
  calculateCommissionBreakdown,
  validateOrderStatusTransition,
  normalizePaymentReference,
  type OrderStatus,
  type PaymentStatus,
  type PromotionRuleInput,
} from '../lib/money.ts';
import {
  encryptSecretDeliveryCode,
  decryptSecretDeliveryCode,
  maskSecretCode,
  maskDocumentNumber,
  sanitizeStringInput,
  assertNoMongoOperators,
} from '../lib/security.ts';
import {
  prepareSafeStorageObject,
  authorizeAndCreateSignedDocumentUrl,
  isObjectStorageConfigured,
} from '../lib/storage.ts';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  type NotificationTemplate,
  renderNotificationTemplate,
  isEmailProviderConfigured,
} from '../lib/email.ts';
import { FUTURE_NEPAL_GATEWAY_STATUS } from '../lib/payment-gateway.ts';
import { isMongoUriConfigured } from '../lib/mongodb.ts';

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  mobileNumber: string;
  roles: string[];
  emailVerified: boolean;
  mobileVerified: boolean;
  mfaEnabled: boolean;
  status: 'active' | 'suspended' | 'deactivated';
  vendorId?: string;
  kycStatus:
    | 'Not Started'
    | 'Draft'
    | 'Submitted'
    | 'Under Review'
    | 'More Information Required'
    | 'Approved'
    | 'Rejected'
    | 'Expired'
    | 'Resubmission Required';
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

export interface LoginHistoryRecord {
  id: string;
  userId: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  outcome: 'success' | 'failed_credentials' | 'blocked_suspended' | 'rate_limited';
  timestamp: string;
}

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  subcategories: string[];
  commissionRatePercent: number;
  requiredCustomerFields: Array<{
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
    requireConfirmation: boolean;
  }>;
  isActive: boolean;
}

export interface ProductVariantRecord {
  variantId: string;
  label: string;
  pricePaisa: number;
  stockCount: number;
  sku: string;
}

export interface ProductRecord {
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
  sourcingCostPaisa: number;
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
  variants: ProductVariantRecord[];
  approvalStatus: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Suspended';
  rejectionReason: string;
  isFeatured: boolean;
  requiresCustomerKyc: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorRecord {
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
  status: 'Draft' | 'Pending Review' | 'Under Review' | 'Approved' | 'Rejected' | 'Suspended' | 'Deactivated';
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
  agreementAcceptedAt: string;
  createdAt: string;
}

export interface KycApplicationRecord {
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
  documentNumberEncrypted: string;
  frontDocumentStorageKey: string;
  backDocumentStorageKey: string;
  status:
    | 'Not Started'
    | 'Draft'
    | 'Submitted'
    | 'Under Review'
    | 'More Information Required'
    | 'Approved'
    | 'Rejected'
    | 'Expired'
    | 'Resubmission Required';
  assignedReviewerId: string | null;
  reviewNotes: string;
  rejectionReason: string;
  reviewedAt: string | null;
  decisionHistory: Array<{
    status: string;
    actorId: string;
    reason: string;
    timestamp: string;
  }>;
  createdAt: string;
}

export interface PaymentMethodRecord {
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

export interface PaymentRecord {
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
  status: PaymentStatus;
  reviewedByUserId: string | null;
  reviewedByName: string;
  reviewDecisionReason: string;
  reviewedAt: string | null;
  idempotencyApprovalKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRecord {
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
  orderStatus: OrderStatus;
  paymentId: string;
  paymentStatus: PaymentStatus;
  fulfillmentId: string | null;
  timeline: Array<{
    status: string;
    note: string;
    actorName: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  vendorId: string;
  customerId: string;
  assignedStaffOrVendorUserId: string;
  fulfilledByName: string;
  deliveryReference: string;
  deliveryNotes: string;
  internalStaffNotes: string;
  secretCodeEncrypted: string | null;
  secretCodeMasked: string | null;
  evidenceStorageKey: string;
  status: 'Pending' | 'Delivered' | 'Confirmed By Customer' | 'Disputed';
  deliveredAt: string;
}

export interface DigitalInventoryItem {
  id: string;
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  vendorId: string;
  batchReference: string;
  secretCodeEncrypted: string;
  secretCodeMasked: string;
  status: 'available' | 'reserved' | 'allocated' | 'expired';
  reservedOrderId: string | null;
  expiresAt: string;
  activationNotes: string;
  createdAt: string;
}

export interface RefundRequestRecord {
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
  evidenceStorageKey: string;
  status: 'Requested' | 'Under Review' | 'More Information Required' | 'Approved' | 'Rejected' | 'Processing' | 'Completed';
  assignedReviewerId: string | null;
  decisionReason: string;
  refundReference: string;
  completedAt: string | null;
  createdAt: string;
}

export interface FinancialLedgerRecord {
  id: string;
  entryNumber: string;
  idempotencyKey: string;
  orderId: string | null;
  orderNumber: string;
  vendorId: string | null;
  entryType:
    | 'payment_verified'
    | 'marketplace_commission'
    | 'vendor_earning_credit'
    | 'refund_reversal'
    | 'vendor_settlement_payout'
    | 'manual_adjustment';
  direction: 'credit' | 'debit';
  amountPaisa: number;
  currency: 'NPR';
  description: string;
  actorUserId: string;
  createdAt: string;
}

export interface VendorSettlementRecord {
  id: string;
  settlementNumber: string;
  vendorId: string;
  vendorName: string;
  requestedAmountPaisa: number;
  bankDetailsSnapshot: string;
  status:
    | 'Settlement Requested'
    | 'Settlement Under Review'
    | 'Settlement Approved'
    | 'Settlement Paid'
    | 'Settlement Rejected';
  reviewedByUserId: string | null;
  payoutReference: string;
  decisionReason: string;
  paidAt: string | null;
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  ticketNumber: string;
  requesterUserId: string;
  requesterName: string;
  requesterRole: string;
  orderNumber: string;
  category:
    | 'Payment Verification'
    | 'Order Delivery Delay'
    | 'Invalid Code / Top-Up Issue'
    | 'KYC Verification'
    | 'Vendor Inquiry'
    | 'General Support';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject: string;
  status: 'Open' | 'In Progress' | 'Awaiting Customer' | 'Escalated' | 'Resolved';
  assignedAdminId: string | null;
  resolutionSummary: string;
  messages: Array<{
    messageId: string;
    senderUserId: string;
    senderName: string;
    senderRole: string;
    body: string;
    isInternalNote: boolean;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  title: string;
  body: string;
  category: string;
  isRead: boolean;
  emailDeliveryStatus: 'sent_via_provider' | 'in_app_only_email_unconfigured';
  createdAt: string;
}

export interface AuditLogRecord {
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
}

export class MarketplaceStore {
  public branding: BrandingConfig = structuredClone(DEFAULT_BRANDING_CONFIG);
  public roles: RoleDefinition[] = structuredClone(INITIAL_ROLES);
  public notificationTemplates: NotificationTemplate[] = structuredClone(DEFAULT_NOTIFICATION_TEMPLATES);
  public globalCommissionRatePercent = 8;
  public minSettlementPayoutPaisa = nprToPaisa(2500);
  public kycHighValueThresholdPaisa = nprToPaisa(15000);

  public users: UserAccount[] = [];
  public loginHistory: LoginHistoryRecord[] = [];
  public categories: CategoryRecord[] = [];
  public vendors: VendorRecord[] = [];
  public products: ProductRecord[] = [];
  public productApprovalHistory: Array<{
    id: string;
    productId: string;
    actorUserId: string;
    previousStatus: string;
    newStatus: string;
    reason: string;
    createdAt: string;
  }> = [];
  public digitalInventory: DigitalInventoryItem[] = [];
  public kycApplications: KycApplicationRecord[] = [];
  public paymentMethods: PaymentMethodRecord[] = [];
  public payments: PaymentRecord[] = [];
  public orders: OrderRecord[] = [];
  public fulfillments: FulfillmentRecord[] = [];
  public promotions: PromotionRuleInput[] = [];
  public promoRedemptions: Array<{
    id: string;
    promotionCode: string;
    customerId: string;
    orderId: string;
    discountPaisa: number;
    createdAt: string;
  }> = [];
  public refunds: RefundRequestRecord[] = [];
  public ledger: FinancialLedgerRecord[] = [];
  public settlements: VendorSettlementRecord[] = [];
  public supportTickets: SupportTicketRecord[] = [];
  public notifications: NotificationRecord[] = [];
  public auditLogs: AuditLogRecord[] = [];

  private loginAttempts = new Map<string, { count: number; windowStart: number }>();
  private paymentApprovalLocks = new Set<string>();
  private fulfillmentLocks = new Set<string>();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const defaultPasswordHash = bcrypt.hashSync('Nepal@2026!', 10);

    // 1. Users covering Super Admin, specialized RBAC admins, Vendors, and Customers
    this.users = [
      {
        id: 'usr_super_admin',
        email: 'superadmin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Rajeshwar Koirala (Super Admin)',
        mobileNumber: '+977-9851000001',
        roles: ['super_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Thapathali, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:00:00.000Z',
      },
      {
        id: 'usr_payment_admin',
        email: 'payment.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Binod Adhikari (Payment Verification Admin)',
        mobileNumber: '+977-9851000002',
        roles: ['payment_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'New Baneshwor, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:15:00.000Z',
      },
      {
        id: 'usr_kyc_admin',
        email: 'kyc.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Anusha Shrestha (KYC Verification Admin)',
        mobileNumber: '+977-9851000003',
        roles: ['kyc_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Lalitpur',
        addressLine: 'Pulchowk, Lalitpur',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:20:00.000Z',
      },
      {
        id: 'usr_fulfillment_admin',
        email: 'fulfillment.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Dipesh Thapa (Order & Fulfillment Admin)',
        mobileNumber: '+977-9851000004',
        roles: ['fulfillment_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Putalisadak, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:25:00.000Z',
      },
      {
        id: 'usr_support_admin',
        email: 'support.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Prakriti Maharjan (Customer Support Admin)',
        mobileNumber: '+977-9851000005',
        roles: ['support_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: false,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Kalimati, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:30:00.000Z',
      },
      {
        id: 'usr_finance_admin',
        email: 'finance.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Suman Bhattarai (Finance & Settlement Admin)',
        mobileNumber: '+977-9851000006',
        roles: ['finance_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Lazimpat, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:35:00.000Z',
      },
      {
        id: 'usr_product_admin',
        email: 'product.admin@mandaladigital.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Kiran Poudel (Product Management Admin)',
        mobileNumber: '+977-9851000007',
        roles: ['product_admin'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: true,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Maitighar, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-01T04:40:00.000Z',
      },
      {
        id: 'usr_vendor_kantipur',
        email: 'vendor@kantipurgaming.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Sujan Ranjitkar (Kantipur Gaming Hub)',
        mobileNumber: '+977-9801122334',
        roles: ['vendor'],
        vendorId: 'vnd_kantipur',
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: false,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'New Road, People’s Plaza, Kathmandu',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: true, inAppAlerts: true },
        createdAt: '2026-10-02T06:00:00.000Z',
      },
      {
        id: 'usr_vendor_himalayan',
        email: 'vendor@himalayancloud.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Nabin Joshi (Himalayan Cloud & Telecom)',
        mobileNumber: '+977-9841998877',
        roles: ['vendor'],
        vendorId: 'vnd_himalayan',
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: false,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Lalitpur',
        addressLine: 'Jhamsikhel, Lalitpur',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: true, inAppAlerts: true },
        createdAt: '2026-10-02T07:30:00.000Z',
      },
      {
        id: 'usr_customer_aarav',
        email: 'aarav.sharma@example.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Aarav Sharma',
        mobileNumber: '+977-9841234567',
        roles: ['customer'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: false,
        status: 'active',
        kycStatus: 'Submitted',
        country: 'Nepal',
        province: 'Bagmati Province',
        city: 'Kathmandu',
        addressLine: 'Baluwatar, Ward 4, Kathmandu',
        savedProductIds: ['prd_pubg_660', 'prd_canva_pro'],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: true, inAppAlerts: true },
        createdAt: '2026-10-05T09:00:00.000Z',
      },
      {
        id: 'usr_customer_sita',
        email: 'sita.gurung@example.com.np',
        passwordHash: defaultPasswordHash,
        fullName: 'Sita Gurung',
        mobileNumber: '+977-9808765432',
        roles: ['customer'],
        emailVerified: true,
        mobileVerified: true,
        mfaEnabled: false,
        status: 'active',
        kycStatus: 'Approved',
        country: 'Nepal',
        province: 'Gandaki Province',
        city: 'Pokhara',
        addressLine: 'Lakeside-6, Pokhara',
        savedProductIds: [],
        notificationPreferences: { emailOrderUpdates: true, emailPromotions: false, inAppAlerts: true },
        createdAt: '2026-10-06T10:15:00.000Z',
      },
    ];

    // 2. Categories
    this.categories = [
      {
        id: 'cat_gaming',
        slug: 'gaming-top-ups',
        name: 'Gaming Top-Ups',
        description: 'Authorized direct UID top-ups for PUBG Mobile UC, Free Fire Diamonds, and game vouchers.',
        subcategories: ['PUBG Mobile UC', 'Free Fire Diamonds', 'Authorized Game Currencies', 'Game Vouchers'],
        commissionRatePercent: 7,
        requiredCustomerFields: [
          {
            key: 'playerUid',
            label: 'Player UID / Character ID',
            placeholder: 'e.g. 5182930412',
            required: true,
            requireConfirmation: true,
          },
          {
            key: 'inGameName',
            label: 'In-Game Character Name (IGN)',
            placeholder: 'e.g. GorkhaSniperNP',
            required: true,
            requireConfirmation: false,
          },
          {
            key: 'serverRegion',
            label: 'Server / Region',
            placeholder: 'Global / South Asia / Nepal',
            required: true,
            requireConfirmation: false,
          },
        ],
        isActive: true,
      },
      {
        id: 'cat_giftcards',
        slug: 'gift-cards-and-digital-codes',
        name: 'Gift Cards & Digital Codes',
        description: 'Official redeemable gift cards, Steam codes, PlayStation vouchers, and digital licenses.',
        subcategories: ['Authorized Gift Cards', 'Game Vouchers', 'Redeemable Codes', 'Promotional Codes', 'Digital Licenses'],
        commissionRatePercent: 8,
        requiredCustomerFields: [
          {
            key: 'recipientEmail',
            label: 'Authorized Delivery Email',
            placeholder: 'customer@example.com.np',
            required: true,
            requireConfirmation: true,
          },
        ],
        isActive: true,
      },
      {
        id: 'cat_software',
        slug: 'software-and-subscriptions',
        name: 'Software & Subscriptions',
        description: 'Authorized Canva subscriptions, Google Workspace seats, productivity suites, and AI tools.',
        subcategories: [
          'Eligible Canva Subscriptions',
          'Eligible Google Subscriptions',
          'Authorized Productivity Software',
          'AI Subscriptions',
          'Other Lawful Software Products',
        ],
        commissionRatePercent: 10,
        requiredCustomerFields: [
          {
            key: 'accountEmail',
            label: 'Target Account / Domain Email for License Assignment',
            placeholder: 'name@company.com.np',
            required: true,
            requireConfirmation: true,
          },
          {
            key: 'organizationName',
            label: 'Organization or Full Name',
            placeholder: 'e.g. Everest Studio Pvt. Ltd.',
            required: false,
            requireConfirmation: false,
          },
        ],
        isActive: true,
      },
      {
        id: 'cat_recharge',
        slug: 'recharge-services',
        name: 'Recharge Services',
        description: 'Nepal Telecom (NTC), Ncell prepaid/postpaid voice & data packs, and utility top-ups.',
        subcategories: [
          'Nepal Telecom Recharge',
          'Ncell Recharge',
          'Supported Prepaid and Data Packages',
          'Other Approved Recharge Services',
        ],
        commissionRatePercent: 4,
        requiredCustomerFields: [
          {
            key: 'telecomMobileNumber',
            label: '10-Digit Nepal Mobile / Subscriber Number',
            placeholder: '9841XXXXXX or 980XXXXXXX',
            required: true,
            requireConfirmation: true,
          },
          {
            key: 'operatorName',
            label: 'Telecom Operator',
            placeholder: 'Nepal Telecom (NTC) or Ncell',
            required: true,
            requireConfirmation: false,
          },
        ],
        isActive: true,
      },
      {
        id: 'cat_digital',
        slug: 'other-digital-products',
        name: 'Other Digital Products',
        description: 'Nepali technical e-books, engineering exam guides, and authorized software licenses.',
        subcategories: ['E-books', 'Digital Files', 'Authorized Software Licenses', 'Other Approved Digital Goods'],
        commissionRatePercent: 10,
        requiredCustomerFields: [
          {
            key: 'deliveryEmail',
            label: 'Delivery Email Address',
            placeholder: 'reader@example.com.np',
            required: true,
            requireConfirmation: true,
          },
        ],
        isActive: true,
      },
    ];

    // 3. Vendors (2 Approved, 1 Pending Review)
    this.vendors = [
      {
        id: 'vnd_kantipur',
        ownerUserId: 'usr_vendor_kantipur',
        shopName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        slug: 'kantipur-gaming-digital-hub',
        businessRegNumber: 'OCR-NP-2079-44182',
        panVatNumber: 'PAN 609112450',
        contactEmail: 'vendor@kantipurgaming.com.np',
        contactMobile: '+977-9801122334',
        country: 'Nepal',
        city: 'Kathmandu',
        address: 'New Road, People’s Plaza Floor 3, Kathmandu',
        categories: ['Gaming Top-Ups', 'Gift Cards & Digital Codes'],
        resellerAuthorizationStatement:
          'Authorized sub-distributor for South Asia digital vouchers and Midasbuy/Codashop merchant partner.',
        status: 'Approved',
        commissionRatePercent: 7,
        pendingEarningsPaisa: nprToPaisa(1348.5),
        availableEarningsPaisa: nprToPaisa(8450),
        totalSettledPaisa: nprToPaisa(24000),
        bankPayoutDetails: {
          bankName: 'Nabil Bank Limited',
          accountName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
          accountNumber: '0210017582910',
          branch: 'New Road Branch, Kathmandu',
        },
        reviewNotes: 'Verified PAN certificate, OCR registration, and distributor invoice.',
        decisionReason: 'Approved by Vendor Verification Admin.',
        agreementAcceptedAt: '2026-10-02T06:00:00.000Z',
        createdAt: '2026-10-02T06:00:00.000Z',
      },
      {
        id: 'vnd_himalayan',
        ownerUserId: 'usr_vendor_himalayan',
        shopName: 'Himalayan Cloud & Telecom Store',
        slug: 'himalayan-cloud-telecom',
        businessRegNumber: 'OCR-NP-2080-88310',
        panVatNumber: 'PAN 608441920',
        contactEmail: 'vendor@himalayancloud.com.np',
        contactMobile: '+977-9841998877',
        country: 'Nepal',
        city: 'Lalitpur',
        address: 'Jhamsikhel-3, Lalitpur',
        categories: ['Software & Subscriptions', 'Recharge Services', 'Other Digital Products'],
        resellerAuthorizationStatement:
          'Authorized cloud reseller partner and official NTC/Ncell corporate MPOS dealer in Nepal.',
        status: 'Approved',
        commissionRatePercent: 8,
        pendingEarningsPaisa: 0,
        availableEarningsPaisa: nprToPaisa(12650),
        totalSettledPaisa: nprToPaisa(18500),
        bankPayoutDetails: {
          bankName: 'Global IME Bank Limited',
          accountName: 'Himalayan Cloud & Telecom Store Pvt. Ltd.',
          accountNumber: '0701010004912',
          branch: 'Pulchowk Branch, Lalitpur',
        },
        reviewNotes: 'Cloud partner authorization certificate verified.',
        decisionReason: 'Approved for software licenses and telecom recharge.',
        agreementAcceptedAt: '2026-10-02T07:30:00.000Z',
        createdAt: '2026-10-02T07:30:00.000Z',
      },
      {
        id: 'vnd_pokhara_pending',
        ownerUserId: 'usr_customer_sita',
        shopName: 'Pokhara Digital Keys & Top-Up Center',
        slug: 'pokhara-digital-keys',
        businessRegNumber: 'OCR-KASKI-2081-1129',
        panVatNumber: 'PAN 610293847',
        contactEmail: 'apply@pokharadigital.com.np',
        contactMobile: '+977-9808765432',
        country: 'Nepal',
        city: 'Pokhara',
        address: 'New Road, Chipledhunga, Pokhara',
        categories: ['Gaming Top-Ups', 'Gift Cards & Digital Codes'],
        resellerAuthorizationStatement:
          'Regional gaming voucher retailer in Gandaki Province with authorized wholesale supply invoices.',
        status: 'Pending Review',
        commissionRatePercent: 8,
        pendingEarningsPaisa: 0,
        availableEarningsPaisa: 0,
        totalSettledPaisa: 0,
        bankPayoutDetails: {
          bankName: 'NIC Asia Bank Limited',
          accountName: 'Pokhara Digital Keys & Top-Up Center',
          accountNumber: '1941058291024',
          branch: 'Chipledhunga Branch, Pokhara',
        },
        reviewNotes: 'Awaiting Vendor Verification Admin review.',
        decisionReason: '',
        agreementAcceptedAt: '2026-10-18T11:00:00.000Z',
        createdAt: '2026-10-18T11:00:00.000Z',
      },
    ];

    // 4. Products (8 Approved + 1 Pending Approval)
    this.products = [
      {
        id: 'prd_pubg_660',
        slug: 'pubg-mobile-660-uc-global-top-up',
        vendorId: 'vnd_kantipur',
        vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        categoryId: 'cat_gaming',
        categoryName: 'Gaming Top-Ups',
        subcategory: 'PUBG Mobile UC',
        title: 'PUBG Mobile 660 UC (600 + 60 Bonus) Direct UID Top-Up',
        shortDescription: 'Official Global Server PUBG Mobile Unknown Cash delivered manually via Player UID.',
        description:
          'Authorized PUBG Mobile Unknown Cash (UC) top-up for Global and South Asia accounts. Requires only your numeric Player UID and In-Game Name. We never request your login password or OTP.',
        artworkType: 'gaming_topup',
        pricePaisa: nprToPaisa(1450),
        sourcingCostPaisa: nprToPaisa(1310),
        expectedFulfillmentMinutes: 15,
        regionRestriction: 'Global Server (Excludes CN/JP/KR/TW/VN servers)',
        refundEligibility: 'Refundable Before Fulfillment or If UID Delivery Fails',
        productTerms: 'Verify your numeric Player UID carefully before checkout. Once UC is credited to a valid Player UID, the publisher cannot reverse the transfer.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/kantipur_midasbuy_auth.pdf',
        requiredCustomerFields: this.categories[0].requiredCustomerFields,
        variants: [
          { variantId: 'var_pubg_60', label: '60 UC Standard Pack', pricePaisa: nprToPaisa(155), stockCount: 120, sku: 'PUBG-UC-60' },
          { variantId: 'var_pubg_325', label: '325 UC (300 + 25 Bonus)', pricePaisa: nprToPaisa(740), stockCount: 85, sku: 'PUBG-UC-325' },
          { variantId: 'var_pubg_660', label: '660 UC (600 + 60 Bonus)', pricePaisa: nprToPaisa(1450), stockCount: 64, sku: 'PUBG-UC-660' },
          { variantId: 'var_pubg_1800', label: '1,800 UC (1500 + 300 Bonus)', pricePaisa: nprToPaisa(3650), stockCount: 30, sku: 'PUBG-UC-1800' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-03T08:00:00.000Z',
        updatedAt: '2026-10-03T08:00:00.000Z',
      },
      {
        id: 'prd_freefire_1060',
        slug: 'free-fire-1060-diamonds-nepal-uid',
        vendorId: 'vnd_kantipur',
        vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        categoryId: 'cat_gaming',
        categoryName: 'Gaming Top-Ups',
        subcategory: 'Free Fire Diamonds',
        title: 'Garena Free Fire 1,060 Diamonds UID Top-Up (Nepal/BD/SG)',
        shortDescription: 'Authorized Garena Free Fire Diamonds credited directly to your Player UID.',
        description:
          'Instant manual fulfillment of 1,060 Garena Free Fire Diamonds by verified Nepal gaming desk. Compatible with Nepal/South Asia server accounts via Player ID.',
        artworkType: 'gaming_topup',
        pricePaisa: nprToPaisa(1320),
        sourcingCostPaisa: nprToPaisa(1190),
        expectedFulfillmentMinutes: 15,
        regionRestriction: 'Nepal / South Asia Server',
        refundEligibility: 'Refundable Before Fulfillment or If UID Delivery Fails',
        productTerms: 'Requires numeric Player UID only. Never share your Garena/Facebook login password.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/kantipur_garena_auth.pdf',
        requiredCustomerFields: this.categories[0].requiredCustomerFields,
        variants: [
          { variantId: 'var_ff_310', label: '310 Diamonds Pack', pricePaisa: nprToPaisa(410), stockCount: 150, sku: 'FF-DIA-310' },
          { variantId: 'var_ff_520', label: '520 Diamonds Pack', pricePaisa: nprToPaisa(675), stockCount: 95, sku: 'FF-DIA-520' },
          { variantId: 'var_ff_1060', label: '1,060 Diamonds Pack', pricePaisa: nprToPaisa(1320), stockCount: 70, sku: 'FF-DIA-1060' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-03T09:00:00.000Z',
        updatedAt: '2026-10-03T09:00:00.000Z',
      },
      {
        id: 'prd_steam_20',
        slug: 'steam-wallet-20-usd-gift-card-code',
        vendorId: 'vnd_kantipur',
        vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        categoryId: 'cat_giftcards',
        categoryName: 'Gift Cards & Digital Codes',
        subcategory: 'Authorized Gift Cards',
        title: 'Steam Wallet USD $20 Official Redeemable Digital Code',
        shortDescription: 'Protected 15-character Steam Wallet voucher code delivered via encrypted vault.',
        description:
          'Official USD $20 Steam Wallet digital gift code sourced from authorized regional distributors. Delivered manually after payment verification into your encrypted Customer Dashboard vault.',
        artworkType: 'gift_card',
        pricePaisa: nprToPaisa(2850),
        sourcingCostPaisa: nprToPaisa(2640),
        expectedFulfillmentMinutes: 20,
        regionRestriction: 'USD Wallet Accounts (South Asia / Global USD)',
        refundEligibility: 'Refundable Before Code Reveal or If Proven Invalid',
        productTerms: 'Ensure your Steam store currency is set to USD before redeeming.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/kantipur_steam_auth.pdf',
        requiredCustomerFields: this.categories[1].requiredCustomerFields,
        variants: [
          { variantId: 'var_steam_10', label: 'Steam USD $10 Code', pricePaisa: nprToPaisa(1440), stockCount: 40, sku: 'STEAM-USD-10' },
          { variantId: 'var_steam_20', label: 'Steam USD $20 Code', pricePaisa: nprToPaisa(2850), stockCount: 35, sku: 'STEAM-USD-20' },
          { variantId: 'var_steam_50', label: 'Steam USD $50 Code', pricePaisa: nprToPaisa(7100), stockCount: 15, sku: 'STEAM-USD-50' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-04T06:00:00.000Z',
        updatedAt: '2026-10-04T06:00:00.000Z',
      },
      {
        id: 'prd_canva_pro',
        slug: 'canva-pro-1-year-authorized-subscription',
        vendorId: 'vnd_himalayan',
        vendorName: 'Himalayan Cloud & Telecom Store',
        categoryId: 'cat_software',
        categoryName: 'Software & Subscriptions',
        subcategory: 'Eligible Canva Subscriptions',
        title: 'Canva Pro 1-Year Authorized Subscription License (Own Email)',
        shortDescription: 'Official annual Canva Pro license activated on your existing personal or business email.',
        description:
          'Authorized annual Canva Pro subscription for Nepali designers, marketing agencies, and educators. Activated directly on your own email address via official reseller license assignment — never a shared password account.',
        artworkType: 'software_license',
        pricePaisa: nprToPaisa(4200),
        sourcingCostPaisa: nprToPaisa(3650),
        expectedFulfillmentMinutes: 30,
        regionRestriction: 'Nepal / Worldwide',
        refundEligibility: 'Full Verification Guarantee (12-Month Warranty)',
        productTerms: 'Activated via official license invitation to your email. No password required.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/himalayan_cloud_auth.pdf',
        requiredCustomerFields: this.categories[2].requiredCustomerFields,
        variants: [
          { variantId: 'var_canva_1yr', label: '1-Year Individual License', pricePaisa: nprToPaisa(4200), stockCount: 50, sku: 'CANVA-PRO-1Y' },
          { variantId: 'var_canva_team3', label: '1-Year Team (3 Seats) Pack', pricePaisa: nprToPaisa(11500), stockCount: 20, sku: 'CANVA-TEAM-3Y' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-04T08:00:00.000Z',
        updatedAt: '2026-10-04T08:00:00.000Z',
      },
      {
        id: 'prd_gworkspace_starter',
        slug: 'google-workspace-business-starter-annual-nepal',
        vendorId: 'vnd_himalayan',
        vendorName: 'Himalayan Cloud & Telecom Store',
        categoryId: 'cat_software',
        categoryName: 'Software & Subscriptions',
        subcategory: 'Eligible Google Subscriptions',
        title: 'Google Workspace Business Starter — 1 Year Authorized License',
        shortDescription: 'Custom domain business email, 30GB Drive storage, and Google Meet for Nepali companies.',
        description:
          'Official Google Workspace Business Starter annual license billed in NPR with local VAT invoice support. Provisioned manually by certified Kathmandu cloud engineers for your custom domain.',
        artworkType: 'software_license',
        pricePaisa: nprToPaisa(8900),
        sourcingCostPaisa: nprToPaisa(7800),
        expectedFulfillmentMinutes: 60,
        regionRestriction: 'Nepal Registered Businesses & Domains',
        refundEligibility: 'Refundable Prior to Domain Provisioning',
        productTerms: 'Provide your domain name and admin contact email.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/himalayan_gworkspace_auth.pdf',
        requiredCustomerFields: this.categories[2].requiredCustomerFields,
        variants: [
          { variantId: 'var_gw_1seat', label: '1 User Seat (Annual)', pricePaisa: nprToPaisa(8900), stockCount: 100, sku: 'GW-START-1Y' },
          { variantId: 'var_gw_5seat', label: '5 User Seats (Annual Bundle)', pricePaisa: nprToPaisa(43000), stockCount: 25, sku: 'GW-START-5Y' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'prd_ncell_40gb',
        slug: 'ncell-30-day-40gb-voice-data-combo',
        vendorId: 'vnd_himalayan',
        vendorName: 'Himalayan Cloud & Telecom Store',
        categoryId: 'cat_recharge',
        categoryName: 'Recharge Services',
        subcategory: 'Ncell Recharge',
        title: 'Ncell Sadhain ON 40GB + 500 Min All-Net Monthly Pack',
        shortDescription: 'Manual corporate dealer recharge for Ncell prepaid and postpaid numbers in Nepal.',
        description:
          'Official Ncell monthly data and voice combo package fulfilled manually via verified dealer MPOS terminal once payment is approved.',
        artworkType: 'telecom_recharge',
        pricePaisa: nprToPaisa(799),
        sourcingCostPaisa: nprToPaisa(760),
        expectedFulfillmentMinutes: 10,
        regionRestriction: 'Nepal (Ncell 980/981/982 Numbers Only)',
        refundEligibility: 'Full Refund If Operator Activation Fails',
        productTerms: 'Double-check your 10-digit Ncell number before confirming checkout.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/himalayan_ncell_dealer.pdf',
        requiredCustomerFields: this.categories[3].requiredCustomerFields,
        variants: [
          { variantId: 'var_ncell_40gb', label: 'Rs. 799 Sadhain ON (40GB + 500 Min)', pricePaisa: nprToPaisa(799), stockCount: 200, sku: 'NCELL-799' },
          { variantId: 'var_ncell_500bal', label: 'Rs. 500 Main Balance Top-Up', pricePaisa: nprToPaisa(500), stockCount: 300, sku: 'NCELL-500' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: true,
        requiresCustomerKyc: false,
        createdAt: '2026-10-05T05:00:00.000Z',
        updatedAt: '2026-10-05T05:00:00.000Z',
      },
      {
        id: 'prd_ntc_1000',
        slug: 'nepal-telecom-ntc-1000-balance-ftth-recharge',
        vendorId: 'vnd_himalayan',
        vendorName: 'Himalayan Cloud & Telecom Store',
        categoryId: 'cat_recharge',
        categoryName: 'Recharge Services',
        subcategory: 'Nepal Telecom Recharge',
        title: 'Nepal Telecom (NTC) Rs. 1,000 GSM Mobile / FTTH Fiber Recharge',
        shortDescription: 'Official Nepal Telecom balance transfer or recharge PIN fulfilled manually.',
        description:
          'Authorized Nepal Telecom (NTC) Rs. 1,000 recharge suitable for Namaste GSM Prepaid, Postpaid, or NT Fiber FTTH accounts.',
        artworkType: 'telecom_recharge',
        pricePaisa: nprToPaisa(1000),
        sourcingCostPaisa: nprToPaisa(965),
        expectedFulfillmentMinutes: 10,
        regionRestriction: 'Nepal (NTC 984/985/986 or FTTH Landline)',
        refundEligibility: 'Full Refund If Operator Activation Fails',
        productTerms: 'Confirm your 10-digit NTC mobile or FTTH number.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/himalayan_ntc_dealer.pdf',
        requiredCustomerFields: this.categories[3].requiredCustomerFields,
        variants: [
          { variantId: 'var_ntc_500', label: 'Rs. 500 NTC Recharge', pricePaisa: nprToPaisa(500), stockCount: 250, sku: 'NTC-500' },
          { variantId: 'var_ntc_1000', label: 'Rs. 1,000 NTC Recharge', pricePaisa: nprToPaisa(1000), stockCount: 180, sku: 'NTC-1000' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: false,
        requiresCustomerKyc: false,
        createdAt: '2026-10-05T06:00:00.000Z',
        updatedAt: '2026-10-05T06:00:00.000Z',
      },
      {
        id: 'prd_nec_ebook',
        slug: 'nepal-engineering-council-license-exam-digital-compendium',
        vendorId: 'vnd_himalayan',
        vendorName: 'Himalayan Cloud & Telecom Store',
        categoryId: 'cat_digital',
        categoryName: 'Other Digital Products',
        subcategory: 'E-books',
        title: 'Nepal Engineering Council (NEC) Computer & Civil License Digital Guide (2082/83 Edition)',
        shortDescription: 'Authorized 480-page digital PDF handbook with past syllabus solutions and license key.',
        description:
          'Authored and licensed by Kathmandu Technical Publication House. Includes watermarked PDF download access and practice portal activation code.',
        artworkType: 'digital_ebook',
        pricePaisa: nprToPaisa(650),
        sourcingCostPaisa: nprToPaisa(450),
        expectedFulfillmentMinutes: 20,
        regionRestriction: 'Nepal',
        refundEligibility: 'Refundable Before License Key Reveal',
        productTerms: 'Single-user licensed digital copy.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-02/himalayan_ebook_auth.pdf',
        requiredCustomerFields: this.categories[4].requiredCustomerFields,
        variants: [
          { variantId: 'var_nec_comp', label: 'Computer Engineering Edition', pricePaisa: nprToPaisa(650), stockCount: 500, sku: 'NEC-COMP-2083' },
          { variantId: 'var_nec_civil', label: 'Civil Engineering Edition', pricePaisa: nprToPaisa(650), stockCount: 500, sku: 'NEC-CIVIL-2083' },
        ],
        approvalStatus: 'Approved',
        rejectionReason: '',
        isFeatured: false,
        requiresCustomerKyc: false,
        createdAt: '2026-10-05T07:00:00.000Z',
        updatedAt: '2026-10-05T07:00:00.000Z',
      },
      {
        id: 'prd_psn_50_pending',
        slug: 'playstation-network-psn-50-usd-voucher',
        vendorId: 'vnd_kantipur',
        vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        categoryId: 'cat_giftcards',
        categoryName: 'Gift Cards & Digital Codes',
        subcategory: 'Game Vouchers',
        title: 'PlayStation Store PSN USD $50 Digital Gift Card (US Region)',
        shortDescription: 'Official 12-digit PlayStation Network wallet voucher awaiting Product Admin approval.',
        description:
          'Redeemable on US Region PlayStation Network accounts for PS5/PS4 games and PS Plus memberships.',
        artworkType: 'gift_card',
        pricePaisa: nprToPaisa(6950),
        sourcingCostPaisa: nprToPaisa(6450),
        expectedFulfillmentMinutes: 20,
        regionRestriction: 'United States PSN Account Required',
        refundEligibility: 'Refundable Before Code Reveal',
        productTerms: 'Requires US Region PSN ID.',
        resellerAuthorizedConfirmed: true,
        authorizationEvidenceKey: 'private/vendor_document/2026-10-18/kantipur_psn_invoice.pdf',
        requiredCustomerFields: this.categories[1].requiredCustomerFields,
        variants: [
          { variantId: 'var_psn_50', label: 'PSN USD $50 Code', pricePaisa: nprToPaisa(6950), stockCount: 25, sku: 'PSN-US-50' },
        ],
        approvalStatus: 'Pending Approval',
        rejectionReason: '',
        isFeatured: false,
        requiresCustomerKyc: false,
        createdAt: '2026-10-18T14:00:00.000Z',
        updatedAt: '2026-10-18T14:00:00.000Z',
      },
    ];

    // 5. Digital Code Inventory (Encrypted at rest, masked in tables)
    const sampleSteamCode1 = 'STM20-NP94-8821-KATH';
    const sampleSteamCode2 = 'STM20-NP77-3910-POKH';
    const sampleCanvaKey = 'CANVA-NP-2026-PRO-9941';
    this.digitalInventory = [
      {
        id: 'inv_steam_01',
        productId: 'prd_steam_20',
        productTitle: 'Steam Wallet USD $20 Official Redeemable Digital Code',
        variantId: 'var_steam_20',
        variantLabel: 'Steam USD $20 Code',
        vendorId: 'vnd_kantipur',
        batchReference: 'BATCH-STM-2026-10A',
        secretCodeEncrypted: encryptSecretDeliveryCode(sampleSteamCode1),
        secretCodeMasked: maskSecretCode(sampleSteamCode1),
        status: 'available',
        reservedOrderId: null,
        expiresAt: '2027-12-31T23:59:59.000Z',
        activationNotes: 'Redeem in Steam Client -> Games -> Redeem a Steam Wallet Code.',
        createdAt: '2026-10-10T08:00:00.000Z',
      },
      {
        id: 'inv_steam_02',
        productId: 'prd_steam_20',
        productTitle: 'Steam Wallet USD $20 Official Redeemable Digital Code',
        variantId: 'var_steam_20',
        variantLabel: 'Steam USD $20 Code',
        vendorId: 'vnd_kantipur',
        batchReference: 'BATCH-STM-2026-10A',
        secretCodeEncrypted: encryptSecretDeliveryCode(sampleSteamCode2),
        secretCodeMasked: maskSecretCode(sampleSteamCode2),
        status: 'available',
        reservedOrderId: null,
        expiresAt: '2027-12-31T23:59:59.000Z',
        activationNotes: 'Redeem in Steam Client -> Games -> Redeem a Steam Wallet Code.',
        createdAt: '2026-10-10T08:05:00.000Z',
      },
      {
        id: 'inv_canva_01',
        productId: 'prd_canva_pro',
        productTitle: 'Canva Pro 1-Year Authorized Subscription License (Own Email)',
        variantId: 'var_canva_1yr',
        variantLabel: '1-Year Individual License',
        vendorId: 'vnd_himalayan',
        batchReference: 'BATCH-CANVA-2026-10B',
        secretCodeEncrypted: encryptSecretDeliveryCode(sampleCanvaKey),
        secretCodeMasked: maskSecretCode(sampleCanvaKey),
        status: 'available',
        reservedOrderId: null,
        expiresAt: '2027-10-31T23:59:59.000Z',
        activationNotes: 'License key & activation link sent via Canva Partner Portal.',
        createdAt: '2026-10-11T09:00:00.000Z',
      },
    ];

    // 6. Configurable Manual Payment Methods (Nepal)
    this.paymentMethods = [
      {
        code: 'nepalpay_qr',
        displayName: 'NepalPay / Fonepay Merchant QR',
        methodType: 'nepal_qr',
        accountName: 'Mandala Digital Bazaar Pvt. Ltd.',
        accountNumberOrId: 'FONEPAY-MERCHANT-908172',
        bankOrProviderName: 'Global IME Bank / Fonepay Network',
        instructions:
          'Scan the official Mandala Digital Bazaar NepalPay/Fonepay QR from your mobile banking app, eSewa, or Khalti. Enter your exact Order Number (ORD-NP-...) in the Remarks field and submit the 8-to-12 digit Transaction Reference Number.',
        minAmountPaisa: nprToPaisa(50),
        maxAmountPaisa: nprToPaisa(200000),
        currency: 'NPR',
        isEnabled: true,
      },
      {
        code: 'connectips_bank',
        displayName: 'ConnectIPS / Commercial Bank Transfer',
        methodType: 'bank_transfer',
        accountName: 'Mandala Digital Bazaar Pvt. Ltd.',
        accountNumberOrId: '010012094812301',
        bankOrProviderName: 'Nabil Bank Limited (Teendhara Branch, Kathmandu)',
        instructions:
          'Transfer the exact NPR order amount via ConnectIPS or instant interbank transfer to Nabil Bank A/C 010012094812301. Put your Order Number in Remarks and submit the ConnectIPS Batch/Reference ID.',
        minAmountPaisa: nprToPaisa(100),
        maxAmountPaisa: nprToPaisa(500000),
        currency: 'NPR',
        isEnabled: true,
      },
      {
        code: 'esewa_manual',
        displayName: 'eSewa Merchant Manual Transfer',
        methodType: 'digital_wallet',
        accountName: 'Mandala Digital Bazaar Pvt. Ltd.',
        accountNumberOrId: '9801234567',
        bankOrProviderName: 'eSewa Digital Wallet (Nepal)',
        instructions:
          'Send the exact NPR total to verified eSewa Merchant ID 9801234567. Include your Order Number in Remarks and submit the eSewa Transaction Code (e.g. 08X92KL).',
        minAmountPaisa: nprToPaisa(50),
        maxAmountPaisa: nprToPaisa(100000),
        currency: 'NPR',
        isEnabled: true,
      },
      {
        code: 'khalti_manual',
        displayName: 'Khalti Wallet Manual Transfer',
        methodType: 'digital_wallet',
        accountName: 'Mandala Digital Bazaar Pvt. Ltd.',
        accountNumberOrId: '9801234567',
        bankOrProviderName: 'Khalti Digital Wallet (Nepal)',
        instructions:
          'Transfer the exact NPR amount to Khalti Merchant ID 9801234567 with your Order Number in Remarks, then submit the Khalti idx / Transaction ID.',
        minAmountPaisa: nprToPaisa(50),
        maxAmountPaisa: nprToPaisa(100000),
        currency: 'NPR',
        isEnabled: true,
      },
    ];

    // 7. Promotions & Discounts
    this.promotions = [
      {
        code: 'NEPAL10',
        discountType: 'percentage',
        discountValue: 10,
        minOrderPaisa: nprToPaisa(500),
        maxDiscountPaisa: nprToPaisa(350),
        firstOrderOnly: false,
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z',
        totalUsageLimit: 500,
        currentUsageCount: 12,
        perCustomerLimit: 3,
        isActive: true,
      },
      {
        code: 'DASHAIN200',
        discountType: 'fixed',
        discountValue: nprToPaisa(200),
        minOrderPaisa: nprToPaisa(1500),
        maxDiscountPaisa: nprToPaisa(200),
        firstOrderOnly: false,
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z',
        totalUsageLimit: 200,
        currentUsageCount: 5,
        perCustomerLimit: 2,
        isActive: true,
      },
      {
        code: 'FIRSTNP150',
        discountType: 'fixed',
        discountValue: nprToPaisa(150),
        minOrderPaisa: nprToPaisa(1000),
        maxDiscountPaisa: nprToPaisa(150),
        firstOrderOnly: true,
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z',
        totalUsageLimit: 300,
        currentUsageCount: 2,
        perCustomerLimit: 1,
        isActive: true,
      },
    ];

    // 8. KYC Applications (1 Submitted awaiting review, 1 Approved)
    this.kycApplications = [
      {
        id: 'kyc_aarav_01',
        userId: 'usr_customer_aarav',
        customerEmail: 'aarav.sharma@example.com.np',
        legalName: 'Aarav Prasad Sharma',
        dateOfBirth: '1998-04-14',
        country: 'Nepal',
        district: 'Kathmandu',
        municipalityAddress: 'Kathmandu Metropolitan City, Ward No. 4, Baluwatar',
        documentType: 'Nepali Citizenship Certificate',
        documentNumberMasked: maskDocumentNumber('27-01-75-04918'),
        documentNumberEncrypted: encryptSecretDeliveryCode('27-01-75-04918'),
        frontDocumentStorageKey: 'private/kyc_document/2026-10-18/usr_customer_aarav_citizenship_front.jpg',
        backDocumentStorageKey: 'private/kyc_document/2026-10-18/usr_customer_aarav_citizenship_back.jpg',
        status: 'Submitted',
        assignedReviewerId: 'usr_kyc_admin',
        reviewNotes: 'Citizenship front & back uploaded clearly. Ready for KYC Admin decision.',
        rejectionReason: '',
        reviewedAt: null,
        decisionHistory: [
          {
            status: 'Submitted',
            actorId: 'usr_customer_aarav',
            reason: 'Initial Nepali Citizenship submission for high-value digital purchases.',
            timestamp: '2026-10-18T09:30:00.000Z',
          },
        ],
        createdAt: '2026-10-18T09:30:00.000Z',
      },
      {
        id: 'kyc_sita_02',
        userId: 'usr_customer_sita',
        customerEmail: 'sita.gurung@example.com.np',
        legalName: 'Sita Kumari Gurung',
        dateOfBirth: '1996-11-22',
        country: 'Nepal',
        district: 'Kaski',
        municipalityAddress: 'Pokhara Metropolitan City, Ward No. 6, Lakeside',
        documentType: 'National Identity Card (NID)',
        documentNumberMasked: maskDocumentNumber('NID-884-291-004'),
        documentNumberEncrypted: encryptSecretDeliveryCode('NID-884-291-004'),
        frontDocumentStorageKey: 'private/kyc_document/2026-10-08/usr_customer_sita_nid_front.jpg',
        backDocumentStorageKey: 'private/kyc_document/2026-10-08/usr_customer_sita_nid_back.jpg',
        status: 'Approved',
        assignedReviewerId: 'usr_kyc_admin',
        reviewNotes: 'National ID number matched and verified.',
        rejectionReason: '',
        reviewedAt: '2026-10-08T12:00:00.000Z',
        decisionHistory: [
          {
            status: 'Approved',
            actorId: 'usr_kyc_admin',
            reason: 'Verified against National Identity Card details.',
            timestamp: '2026-10-08T12:00:00.000Z',
          },
        ],
        createdAt: '2026-10-08T10:00:00.000Z',
      },
    ];

    // 9. Seed Orders, Payments, Fulfillments, and Financial Ledger Entries
    // Order 1: Completed order (Canva Pro License)
    const order1Gross = nprToPaisa(4200);
    const order1Comm = calculateCommissionBreakdown(order1Gross, 0, 8);
    this.orders.push({
      id: 'ord_1001',
      orderNumber: 'ORD-NP-20261016-1001',
      customerId: 'usr_customer_aarav',
      customerName: 'Aarav Sharma',
      customerEmail: 'aarav.sharma@example.com.np',
      vendorId: 'vnd_himalayan',
      vendorName: 'Himalayan Cloud & Telecom Store',
      productSnapshot: {
        productId: 'prd_canva_pro',
        title: 'Canva Pro 1-Year Authorized Subscription License (Own Email)',
        categoryId: 'cat_software',
        categoryName: 'Software & Subscriptions',
        subcategory: 'Eligible Canva Subscriptions',
        variantId: 'var_canva_1yr',
        variantLabel: '1-Year Individual License',
        unitPricePaisa: order1Gross,
        refundEligibility: 'Full Verification Guarantee (12-Month Warranty)',
        expectedFulfillmentMinutes: 30,
      },
      quantity: 1,
      customerDeliveryInputs: {
        accountEmail: 'aarav.sharma@example.com.np',
        organizationName: 'Aarav Design Studio',
      },
      identifierConfirmedByCustomer: true,
      subtotalPaisa: order1Gross,
      discountPaisa: 0,
      promoCodeUsed: null,
      serviceFeePaisa: 0,
      finalTotalPaisa: order1Gross,
      commissionRatePercent: 8,
      marketplaceCommissionPaisa: order1Comm.marketplaceCommissionPaisa,
      vendorNetEarningPaisa: order1Comm.vendorNetEarningPaisa,
      orderStatus: 'Completed',
      paymentId: 'pay_1001',
      paymentStatus: 'Approved',
      fulfillmentId: 'ful_1001',
      timeline: [
        {
          status: 'Pending Payment',
          note: 'Order created with purchase-time price snapshot (Rs. 4,200).',
          actorName: 'Aarav Sharma',
          timestamp: '2026-10-16T06:00:00.000Z',
        },
        {
          status: 'Payment Under Review',
          note: 'Submitted ConnectIPS reference CIPS88291044.',
          actorName: 'Aarav Sharma',
          timestamp: '2026-10-16T06:10:00.000Z',
        },
        {
          status: 'Awaiting Fulfillment',
          note: 'Payment verified against Nabil Bank ConnectIPS statement.',
          actorName: 'Binod Adhikari (Payment Verification Admin)',
          timestamp: '2026-10-16T06:22:00.000Z',
        },
        {
          status: 'Completed',
          note: 'Canva Pro annual license assigned and verified (Ref: FUL-CANVA-8821).',
          actorName: 'Nabin Joshi (Himalayan Cloud & Telecom)',
          timestamp: '2026-10-16T06:40:00.000Z',
        },
      ],
      createdAt: '2026-10-16T06:00:00.000Z',
      updatedAt: '2026-10-16T06:40:00.000Z',
    });

    this.payments.push({
      id: 'pay_1001',
      orderId: 'ord_1001',
      orderNumber: 'ORD-NP-20261016-1001',
      customerId: 'usr_customer_aarav',
      customerName: 'Aarav Sharma',
      paymentMethodCode: 'connectips_bank',
      paymentMethodName: 'ConnectIPS / Commercial Bank Transfer',
      expectedAmountPaisa: order1Gross,
      currency: 'NPR',
      transactionReferenceRaw: 'CIPS-88291044',
      transactionReferenceNormalized: normalizePaymentReference('CIPS-88291044'),
      senderPhoneOrAccount: 'Nabil Bank A/C 0110048192',
      evidenceStorageKey: 'private/payment_receipt/2026-10-16/ord_1001_cips_receipt.png',
      customerRemarks: 'Transferred Rs. 4,200 via ConnectIPS for ORD-NP-20261016-1001',
      status: 'Approved',
      reviewedByUserId: 'usr_payment_admin',
      reviewedByName: 'Binod Adhikari (Payment Verification Admin)',
      reviewDecisionReason: 'Matched Rs. 4,200 credit on Nabil Bank merchant statement.',
      reviewedAt: '2026-10-16T06:22:00.000Z',
      idempotencyApprovalKey: 'idem_pay_1001',
      createdAt: '2026-10-16T06:00:00.000Z',
      updatedAt: '2026-10-16T06:22:00.000Z',
    });

    const deliveredCanvaCode = 'CANVA-ACT-NP-8821-VERIFIED';
    this.fulfillments.push({
      id: 'ful_1001',
      orderId: 'ord_1001',
      orderNumber: 'ORD-NP-20261016-1001',
      vendorId: 'vnd_himalayan',
      customerId: 'usr_customer_aarav',
      assignedStaffOrVendorUserId: 'usr_vendor_himalayan',
      fulfilledByName: 'Nabin Joshi (Himalayan Cloud & Telecom)',
      deliveryReference: 'FUL-CANVA-8821',
      deliveryNotes: 'Canva Pro 1-Year license activated on aarav.sharma@example.com.np.',
      internalStaffNotes: 'Partner portal seat #4918 assigned.',
      secretCodeEncrypted: encryptSecretDeliveryCode(deliveredCanvaCode),
      secretCodeMasked: maskSecretCode(deliveredCanvaCode),
      evidenceStorageKey: 'private/fulfillment_evidence/2026-10-16/ful_1001_activation.png',
      status: 'Confirmed By Customer',
      deliveredAt: '2026-10-16T06:40:00.000Z',
    });

    // Order 2: Payment Under Review (PUBG Mobile 660 UC — Ready for Payment Admin to verify)
    const order2Gross = nprToPaisa(1450);
    const order2Discount = nprToPaisa(145); // NEPAL10 10%
    const order2Comm = calculateCommissionBreakdown(order2Gross, order2Discount, 7);
    this.orders.push({
      id: 'ord_1002',
      orderNumber: 'ORD-NP-20261019-1002',
      customerId: 'usr_customer_aarav',
      customerName: 'Aarav Sharma',
      customerEmail: 'aarav.sharma@example.com.np',
      vendorId: 'vnd_kantipur',
      vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
      productSnapshot: {
        productId: 'prd_pubg_660',
        title: 'PUBG Mobile 660 UC (600 + 60 Bonus) Direct UID Top-Up',
        categoryId: 'cat_gaming',
        categoryName: 'Gaming Top-Ups',
        subcategory: 'PUBG Mobile UC',
        variantId: 'var_pubg_660',
        variantLabel: '660 UC (600 + 60 Bonus)',
        unitPricePaisa: order2Gross,
        refundEligibility: 'Refundable Before Fulfillment or If UID Delivery Fails',
        expectedFulfillmentMinutes: 15,
      },
      quantity: 1,
      customerDeliveryInputs: {
        playerUid: '5182930412',
        inGameName: 'GorkhaSniperNP',
        serverRegion: 'Global / South Asia',
      },
      identifierConfirmedByCustomer: true,
      subtotalPaisa: order2Gross,
      discountPaisa: order2Discount,
      promoCodeUsed: 'NEPAL10',
      serviceFeePaisa: 0,
      finalTotalPaisa: order2Gross - order2Discount,
      commissionRatePercent: 7,
      marketplaceCommissionPaisa: order2Comm.marketplaceCommissionPaisa,
      vendorNetEarningPaisa: order2Comm.vendorNetEarningPaisa,
      orderStatus: 'Payment Under Review',
      paymentId: 'pay_1002',
      paymentStatus: 'Payment Submitted',
      fulfillmentId: null,
      timeline: [
        {
          status: 'Pending Payment',
          note: 'Order placed with promo NEPAL10 (Net payable: Rs. 1,305).',
          actorName: 'Aarav Sharma',
          timestamp: '2026-10-19T11:00:00.000Z',
        },
        {
          status: 'Payment Under Review',
          note: 'Submitted NepalPay QR reference FONEPAY-99482710.',
          actorName: 'Aarav Sharma',
          timestamp: '2026-10-19T11:04:00.000Z',
        },
      ],
      createdAt: '2026-10-19T11:00:00.000Z',
      updatedAt: '2026-10-19T11:04:00.000Z',
    });

    this.payments.push({
      id: 'pay_1002',
      orderId: 'ord_1002',
      orderNumber: 'ORD-NP-20261019-1002',
      customerId: 'usr_customer_aarav',
      customerName: 'Aarav Sharma',
      paymentMethodCode: 'nepalpay_qr',
      paymentMethodName: 'NepalPay / Fonepay Merchant QR',
      expectedAmountPaisa: order2Gross - order2Discount,
      currency: 'NPR',
      transactionReferenceRaw: 'FONEPAY-99482710',
      transactionReferenceNormalized: normalizePaymentReference('FONEPAY-99482710'),
      senderPhoneOrAccount: '+977-9841234567',
      evidenceStorageKey: 'private/payment_receipt/2026-10-19/ord_1002_fonepay_qr.jpg',
      customerRemarks: 'Paid Rs. 1,305 via Global Smart Plus QR',
      status: 'Payment Submitted',
      reviewedByUserId: null,
      reviewedByName: '',
      reviewDecisionReason: '',
      reviewedAt: null,
      idempotencyApprovalKey: null,
      createdAt: '2026-10-19T11:00:00.000Z',
      updatedAt: '2026-10-19T11:04:00.000Z',
    });

    // Order 3: Paid & Awaiting Manual Fulfillment (Steam Wallet $20 Code)
    const order3Gross = nprToPaisa(2850);
    const order3Comm = calculateCommissionBreakdown(order3Gross, 0, 7);
    this.orders.push({
      id: 'ord_1003',
      orderNumber: 'ORD-NP-20261020-1003',
      customerId: 'usr_customer_sita',
      customerName: 'Sita Gurung',
      customerEmail: 'sita.gurung@example.com.np',
      vendorId: 'vnd_kantipur',
      vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
      productSnapshot: {
        productId: 'prd_steam_20',
        title: 'Steam Wallet USD $20 Official Redeemable Digital Code',
        categoryId: 'cat_giftcards',
        categoryName: 'Gift Cards & Digital Codes',
        subcategory: 'Authorized Gift Cards',
        variantId: 'var_steam_20',
        variantLabel: 'Steam USD $20 Code',
        unitPricePaisa: order3Gross,
        refundEligibility: 'Refundable Before Code Reveal or If Proven Invalid',
        expectedFulfillmentMinutes: 20,
      },
      quantity: 1,
      customerDeliveryInputs: {
        recipientEmail: 'sita.gurung@example.com.np',
      },
      identifierConfirmedByCustomer: true,
      subtotalPaisa: order3Gross,
      discountPaisa: 0,
      promoCodeUsed: null,
      serviceFeePaisa: 0,
      finalTotalPaisa: order3Gross,
      commissionRatePercent: 7,
      marketplaceCommissionPaisa: order3Comm.marketplaceCommissionPaisa,
      vendorNetEarningPaisa: order3Comm.vendorNetEarningPaisa,
      orderStatus: 'Awaiting Fulfillment',
      paymentId: 'pay_1003',
      paymentStatus: 'Approved',
      fulfillmentId: null,
      timeline: [
        {
          status: 'Pending Payment',
          note: 'Order created for Steam Wallet USD $20 Code (Rs. 2,850).',
          actorName: 'Sita Gurung',
          timestamp: '2026-10-20T05:10:00.000Z',
        },
        {
          status: 'Payment Under Review',
          note: 'Submitted eSewa reference ESEWA-7719204.',
          actorName: 'Sita Gurung',
          timestamp: '2026-10-20T05:14:00.000Z',
        },
        {
          status: 'Awaiting Fulfillment',
          note: 'Payment approved by Payment Verification Admin. Eligible for manual fulfillment.',
          actorName: 'Binod Adhikari (Payment Verification Admin)',
          timestamp: '2026-10-20T05:25:00.000Z',
        },
      ],
      createdAt: '2026-10-20T05:10:00.000Z',
      updatedAt: '2026-10-20T05:25:00.000Z',
    });

    this.payments.push({
      id: 'pay_1003',
      orderId: 'ord_1003',
      orderNumber: 'ORD-NP-20261020-1003',
      customerId: 'usr_customer_sita',
      customerName: 'Sita Gurung',
      paymentMethodCode: 'esewa_manual',
      paymentMethodName: 'eSewa Merchant Manual Transfer',
      expectedAmountPaisa: order3Gross,
      currency: 'NPR',
      transactionReferenceRaw: 'ESEWA-7719204',
      transactionReferenceNormalized: normalizePaymentReference('ESEWA-7719204'),
      senderPhoneOrAccount: '9808765432',
      evidenceStorageKey: 'private/payment_receipt/2026-10-20/ord_1003_esewa.jpg',
      customerRemarks: 'Paid via eSewa wallet',
      status: 'Approved',
      reviewedByUserId: 'usr_payment_admin',
      reviewedByName: 'Binod Adhikari (Payment Verification Admin)',
      reviewDecisionReason: 'Verified eSewa Merchant statement credit Rs. 2,850.',
      reviewedAt: '2026-10-20T05:25:00.000Z',
      idempotencyApprovalKey: 'idem_pay_1003',
      createdAt: '2026-10-20T05:10:00.000Z',
      updatedAt: '2026-10-20T05:25:00.000Z',
    });

    // Ledger entries for verified payments
    this.ledger = [
      {
        id: 'led_1001_pay',
        entryNumber: 'LED-20261016-0001',
        idempotencyKey: 'pay_approved_ord_1001',
        orderId: 'ord_1001',
        orderNumber: 'ORD-NP-20261016-1001',
        vendorId: 'vnd_himalayan',
        entryType: 'payment_verified',
        direction: 'credit',
        amountPaisa: order1Gross,
        currency: 'NPR',
        description: 'Verified manual payment received for ORD-NP-20261016-1001',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-16T06:22:00.000Z',
      },
      {
        id: 'led_1001_comm',
        entryNumber: 'LED-20261016-0002',
        idempotencyKey: 'comm_ord_1001',
        orderId: 'ord_1001',
        orderNumber: 'ORD-NP-20261016-1001',
        vendorId: 'vnd_himalayan',
        entryType: 'marketplace_commission',
        direction: 'credit',
        amountPaisa: order1Comm.marketplaceCommissionPaisa,
        currency: 'NPR',
        description: 'Marketplace 8% commission on ORD-NP-20261016-1001',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-16T06:22:00.000Z',
      },
      {
        id: 'led_1001_vnd',
        entryNumber: 'LED-20261016-0003',
        idempotencyKey: 'vnd_earn_ord_1001',
        orderId: 'ord_1001',
        orderNumber: 'ORD-NP-20261016-1001',
        vendorId: 'vnd_himalayan',
        entryType: 'vendor_earning_credit',
        direction: 'credit',
        amountPaisa: order1Comm.vendorNetEarningPaisa,
        currency: 'NPR',
        description: 'Vendor net earning credited for ORD-NP-20261016-1001',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-16T06:22:00.000Z',
      },
      {
        id: 'led_1003_pay',
        entryNumber: 'LED-20261020-0004',
        idempotencyKey: 'pay_approved_ord_1003',
        orderId: 'ord_1003',
        orderNumber: 'ORD-NP-20261020-1003',
        vendorId: 'vnd_kantipur',
        entryType: 'payment_verified',
        direction: 'credit',
        amountPaisa: order3Gross,
        currency: 'NPR',
        description: 'Verified manual payment received for ORD-NP-20261020-1003',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-20T05:25:00.000Z',
      },
      {
        id: 'led_1003_comm',
        entryNumber: 'LED-20261020-0005',
        idempotencyKey: 'comm_ord_1003',
        orderId: 'ord_1003',
        orderNumber: 'ORD-NP-20261020-1003',
        vendorId: 'vnd_kantipur',
        entryType: 'marketplace_commission',
        direction: 'credit',
        amountPaisa: order3Comm.marketplaceCommissionPaisa,
        currency: 'NPR',
        description: 'Marketplace 7% commission on ORD-NP-20261020-1003',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-20T05:25:00.000Z',
      },
      {
        id: 'led_1003_vnd',
        entryNumber: 'LED-20261020-0006',
        idempotencyKey: 'vnd_earn_ord_1003',
        orderId: 'ord_1003',
        orderNumber: 'ORD-NP-20261020-1003',
        vendorId: 'vnd_kantipur',
        entryType: 'vendor_earning_credit',
        direction: 'credit',
        amountPaisa: order3Comm.vendorNetEarningPaisa,
        currency: 'NPR',
        description: 'Vendor net earning credited for ORD-NP-20261020-1003',
        actorUserId: 'usr_payment_admin',
        createdAt: '2026-10-20T05:25:00.000Z',
      },
    ];

    // 10. Vendor Settlement Requests
    this.settlements = [
      {
        id: 'set_101',
        settlementNumber: 'SET-NP-20261019-101',
        vendorId: 'vnd_kantipur',
        vendorName: 'Kantipur Gaming & Digital Hub Pvt. Ltd.',
        requestedAmountPaisa: nprToPaisa(5000),
        bankDetailsSnapshot: 'Nabil Bank Limited — A/C 0210017582910 (New Road Branch, Kathmandu)',
        status: 'Settlement Requested',
        reviewedByUserId: null,
        payoutReference: '',
        decisionReason: '',
        paidAt: null,
        createdAt: '2026-10-19T15:00:00.000Z',
      },
    ];

    // 11. Support Tickets
    this.supportTickets = [
      {
        id: 'tkt_101',
        ticketNumber: 'TKT-NP-1001',
        requesterUserId: 'usr_customer_aarav',
        requesterName: 'Aarav Sharma',
        requesterRole: 'customer',
        orderNumber: 'ORD-NP-20261019-1002',
        category: 'Payment Verification',
        priority: 'medium',
        subject: 'Submitted Fonepay QR Reference for PUBG 660 UC Order',
        status: 'Open',
        assignedAdminId: 'usr_support_admin',
        resolutionSummary: '',
        messages: [
          {
            messageId: 'msg_01',
            senderUserId: 'usr_customer_aarav',
            senderName: 'Aarav Sharma',
            senderRole: 'customer',
            body: 'Namaste, I have submitted my Fonepay reference FONEPAY-99482710 for order ORD-NP-20261019-1002. Please let me know once verified.',
            isInternalNote: false,
            createdAt: '2026-10-19T11:06:00.000Z',
          },
        ],
        createdAt: '2026-10-19T11:06:00.000Z',
        updatedAt: '2026-10-19T11:06:00.000Z',
      },
    ];

    // 12. Initial Audit Logs
    this.recordAuditLog({
      actorId: 'usr_super_admin',
      actorName: 'Rajeshwar Koirala (Super Admin)',
      actorRoles: ['super_admin'],
      actionType: 'PLATFORM_BOOTSTRAP_INITIALIZED',
      targetRecordType: 'SiteSettings',
      targetRecordId: 'mandala_nepal_config',
      reason: 'Initialized Nepal multi-vendor RBAC roles, manual payment methods, and commission rules.',
      beforeSummary: 'uninitialized',
      afterSummary: '12 admin roles + NPR manual payment workflow active',
    });
  }

  public recordAuditLog(params: {
    actorId: string;
    actorName: string;
    actorRoles: string[];
    actionType: string;
    targetRecordType: string;
    targetRecordId: string;
    reason: string;
    beforeSummary?: string;
    afterSummary?: string;
  }): AuditLogRecord {
    const entry: AuditLogRecord = {
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      eventId: `EVT-NP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      actorId: params.actorId,
      actorName: params.actorName,
      actorRoles: params.actorRoles,
      actionType: params.actionType,
      targetRecordType: params.targetRecordType,
      targetRecordId: params.targetRecordId,
      reason: sanitizeStringInput(params.reason, 400),
      beforeSummary: sanitizeStringInput(params.beforeSummary || '', 400),
      afterSummary: sanitizeStringInput(params.afterSummary || '', 400),
      correlationId: `req_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(entry);
    return entry;
  }

  public notifyUser(params: {
    recipientUserId: string;
    templateKey: NotificationTemplate['key'];
    variables: Record<string, string>;
    category?: string;
  }): NotificationRecord {
    const tpl =
      this.notificationTemplates.find((t) => t.key === params.templateKey) ||
      DEFAULT_NOTIFICATION_TEMPLATES[0];
    const rendered = renderNotificationTemplate(tpl, params.variables);
    const notif: NotificationRecord = {
      id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
      recipientUserId: params.recipientUserId,
      title: rendered.subject,
      body: rendered.body,
      category: params.category || params.templateKey,
      isRead: false,
      emailDeliveryStatus: isEmailProviderConfigured()
        ? 'sent_via_provider'
        : 'in_app_only_email_unconfigured',
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(notif);
    return notif;
  }

  // ============================================================================
  // AUTHENTICATION & RATE LIMITING
  // ============================================================================
  public authenticateUser(params: {
    email: string;
    passwordPlain: string;
    ipAddress?: string;
    userAgent?: string;
  }): { user: Omit<UserAccount, 'passwordHash'> } {
    const normalizedEmail = sanitizeStringInput(params.email, 160).toLowerCase();
    const rateKey = `${normalizedEmail}_${params.ipAddress || 'local'}`;
    const now = Date.now();
    const attempt = this.loginAttempts.get(rateKey);
    if (attempt && now - attempt.windowStart < 15 * 60 * 1000 && attempt.count >= 5) {
      this.loginHistory.unshift({
        id: `lgh_${crypto.randomBytes(5).toString('hex')}`,
        userId: 'unknown',
        email: normalizedEmail,
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'Browser',
        outcome: 'rate_limited',
        timestamp: new Date().toISOString(),
      });
      throw new Error('Too many failed login attempts. Account login is temporarily throttled for 15 minutes.');
    }

    const user = this.users.find((u) => u.email === normalizedEmail);
    if (!user || !bcrypt.compareSync(params.passwordPlain, user.passwordHash)) {
      const prevCount = attempt && now - attempt.windowStart < 15 * 60 * 1000 ? attempt.count : 0;
      this.loginAttempts.set(rateKey, { count: prevCount + 1, windowStart: now });
      this.loginHistory.unshift({
        id: `lgh_${crypto.randomBytes(5).toString('hex')}`,
        userId: user?.id || 'unknown',
        email: normalizedEmail,
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'Browser',
        outcome: 'failed_credentials',
        timestamp: new Date().toISOString(),
      });
      throw new Error('Invalid email or password.');
    }

    if (user.status !== 'active') {
      this.loginHistory.unshift({
        id: `lgh_${crypto.randomBytes(5).toString('hex')}`,
        userId: user.id,
        email: normalizedEmail,
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'Browser',
        outcome: 'blocked_suspended',
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Account is currently ${user.status}. Please contact support.`);
    }

    this.loginAttempts.delete(rateKey);
    this.loginHistory.unshift({
      id: `lgh_${crypto.randomBytes(5).toString('hex')}`,
      userId: user.id,
      email: normalizedEmail,
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'Browser',
      outcome: 'success',
      timestamp: new Date().toISOString(),
    });

    const { passwordHash: _omitted, ...safeUser } = user;
    return { user: safeUser };
  }

  public registerCustomer(params: {
    fullName: string;
    email: string;
    mobileNumber: string;
    passwordPlain: string;
    city?: string;
    addressLine?: string;
  }): Omit<UserAccount, 'passwordHash'> {
    const email = sanitizeStringInput(params.email, 160).toLowerCase();
    if (!email.includes('@')) {
      throw new Error('Valid email address is required.');
    }
    if (this.users.some((u) => u.email === email)) {
      throw new Error('An account with this email address already exists.');
    }
    if (params.passwordPlain.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const newUser: UserAccount = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email,
      passwordHash: bcrypt.hashSync(params.passwordPlain, 10),
      fullName: sanitizeStringInput(params.fullName, 120),
      mobileNumber: sanitizeStringInput(params.mobileNumber, 30),
      roles: ['customer'],
      emailVerified: false,
      mobileVerified: false,
      mfaEnabled: false,
      status: 'active',
      kycStatus: 'Not Started',
      country: 'Nepal',
      province: 'Bagmati Province',
      city: sanitizeStringInput(params.city || 'Kathmandu', 80),
      addressLine: sanitizeStringInput(params.addressLine || '', 160),
      savedProductIds: [],
      notificationPreferences: {
        emailOrderUpdates: true,
        emailPromotions: false,
        inAppAlerts: true,
      },
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    this.notifyUser({
      recipientUserId: newUser.id,
      templateKey: 'registration_welcome',
      variables: {
        marketplaceName: this.branding.marketplaceName,
        customerName: newUser.fullName,
      },
    });
    const { passwordHash: _omitted, ...safeUser } = newUser;
    return safeUser;
  }

  // ============================================================================
  // RBAC ENFORCEMENT HELPER
  // ============================================================================
  public assertPermission(actorId: string, requiredPermission: PermissionCode): UserAccount {
    const actor = this.users.find((u) => u.id === actorId);
    if (!actor || actor.status !== 'active') {
      throw new Error('Unauthorized: Active authenticated user required.');
    }
    if (!hasPermission(actor.roles, requiredPermission, this.roles)) {
      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: 'RBAC_ACCESS_DENIED',
        targetRecordType: 'Permission',
        targetRecordId: requiredPermission,
        reason: `Actor attempted action requiring "${requiredPermission}" without authorization.`,
      });
      throw new Error(`Forbidden: You lack the required "${requiredPermission}" permission.`);
    }
    return actor;
  }

  // ============================================================================
  // ORDER CREATION & CHECKOUT
  // ============================================================================
  public createOrder(params: {
    customerId: string;
    productId: string;
    variantId: string;
    quantity: number;
    paymentMethodCode: string;
    customerDeliveryInputs: Record<string, string>;
    identifierConfirmedByCustomer: boolean;
    promoCode?: string;
  }): { order: OrderRecord; payment: PaymentRecord } {
    assertNoMongoOperators(params.customerDeliveryInputs);
    const customer = this.users.find((u) => u.id === params.customerId);
    if (!customer || customer.status !== 'active') {
      throw new Error('Authenticated active customer account required to place an order.');
    }

    const product = this.products.find((p) => p.id === params.productId);
    if (!product || product.approvalStatus !== 'Approved') {
      throw new Error('Only approved products from active vendors can be purchased.');
    }

    const vendor = this.vendors.find((v) => v.id === product.vendorId);
    if (!vendor || vendor.status !== 'Approved') {
      throw new Error('Product vendor is not currently approved for selling.');
    }

    const variant = product.variants.find((v) => v.variantId === params.variantId) || product.variants[0];
    if (!variant) {
      throw new Error('Selected product package/variant does not exist.');
    }
    if (variant.stockCount < params.quantity) {
      throw new Error(`Insufficient stock for ${variant.label}. Available: ${variant.stockCount}.`);
    }

    // Validate required customer delivery fields (e.g. Game UID, Telecom Mobile, License Email)
    for (const field of product.requiredCustomerFields) {
      const value = sanitizeStringInput(params.customerDeliveryInputs[field.key], 200);
      if (field.required && !value) {
        throw new Error(`Required fulfillment field "${field.label}" is missing.`);
      }
      if (field.requireConfirmation && !params.identifierConfirmedByCustomer) {
        throw new Error(`You must confirm the accuracy of "${field.label}" before checkout.`);
      }
    }

    const paymentMethod = this.paymentMethods.find(
      (pm) => pm.code === params.paymentMethodCode && pm.isEnabled
    );
    if (!paymentMethod) {
      throw new Error('Selected manual payment method is invalid or disabled.');
    }

    // Promo validation
    let promoRule: PromotionRuleInput | null = null;
    if (params.promoCode && params.promoCode.trim()) {
      const normalizedCode = params.promoCode.trim().toUpperCase();
      promoRule = this.promotions.find((p) => p.code === normalizedCode) || null;
      if (!promoRule) {
        throw new Error(`Promo code "${normalizedCode}" does not exist.`);
      }
    }

    const customerPriorOrderCount = this.orders.filter((o) => o.customerId === customer.id).length;
    const customerPromoRedemptionCount = promoRule
      ? this.promoRedemptions.filter(
          (r) => r.customerId === customer.id && r.promotionCode === promoRule.code
        ).length
      : 0;

    const totals = calculateCheckoutTotals({
      unitPricePaisa: variant.pricePaisa,
      quantity: params.quantity,
      promo: promoRule,
      customerPriorOrderCount,
      customerPromoRedemptionCount,
      categoryId: product.categoryId,
      vendorId: product.vendorId,
      productId: product.id,
    });

    if (promoRule && !totals.promoApplied && totals.promoRejectionReason) {
      throw new Error(totals.promoRejectionReason);
    }

    // Check high-value KYC policy
    if (
      (product.requiresCustomerKyc || totals.finalTotalPaisa >= this.kycHighValueThresholdPaisa) &&
      customer.kycStatus !== 'Approved'
    ) {
      throw new Error(
        `Orders of ${formatNPR(this.kycHighValueThresholdPaisa)} or above require Approved Customer KYC Verification.`
      );
    }

    if (
      totals.finalTotalPaisa < paymentMethod.minAmountPaisa ||
      totals.finalTotalPaisa > paymentMethod.maxAmountPaisa
    ) {
      throw new Error(
        `Order total ${formatNPR(totals.finalTotalPaisa)} is outside the allowed limits for ${paymentMethod.displayName}.`
      );
    }

    // Reserve stock atomically
    variant.stockCount -= params.quantity;

    // Increment promotion usage atomically if applied
    if (promoRule && totals.promoApplied) {
      if (promoRule.totalUsageLimit > 0 && promoRule.currentUsageCount >= promoRule.totalUsageLimit) {
        variant.stockCount += params.quantity;
        throw new Error('Promotion usage limit was reached concurrently.');
      }
      promoRule.currentUsageCount += 1;
    }

    const category = this.categories.find((c) => c.id === product.categoryId);
    const effectiveCommissionRate =
      vendor.commissionRatePercent || category?.commissionRatePercent || this.globalCommissionRatePercent;
    const comm = calculateCommissionBreakdown(
      totals.subtotalPaisa,
      totals.discountPaisa,
      effectiveCommissionRate
    );

    const orderSeq = 1001 + this.orders.length;
    const dateStamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const orderNumber = `ORD-NP-${dateStamp}-${orderSeq}`;
    const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const sanitizedInputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.customerDeliveryInputs)) {
      sanitizedInputs[k] = sanitizeStringInput(v, 200);
    }

    const order: OrderRecord = {
      id: orderId,
      orderNumber,
      customerId: customer.id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      vendorId: vendor.id,
      vendorName: vendor.shopName,
      productSnapshot: {
        productId: product.id,
        title: product.title,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        subcategory: product.subcategory,
        variantId: variant.variantId,
        variantLabel: variant.label,
        unitPricePaisa: variant.pricePaisa,
        refundEligibility: product.refundEligibility,
        expectedFulfillmentMinutes: product.expectedFulfillmentMinutes,
      },
      quantity: params.quantity,
      customerDeliveryInputs: sanitizedInputs,
      identifierConfirmedByCustomer: true,
      subtotalPaisa: totals.subtotalPaisa,
      discountPaisa: totals.discountPaisa,
      promoCodeUsed: promoRule && totals.promoApplied ? promoRule.code : null,
      serviceFeePaisa: totals.serviceFeePaisa,
      finalTotalPaisa: totals.finalTotalPaisa,
      commissionRatePercent: effectiveCommissionRate,
      marketplaceCommissionPaisa: comm.marketplaceCommissionPaisa,
      vendorNetEarningPaisa: comm.vendorNetEarningPaisa,
      orderStatus: 'Pending Payment',
      paymentId,
      paymentStatus: 'Unpaid',
      fulfillmentId: null,
      timeline: [
        {
          status: 'Pending Payment',
          note: `Order created (${formatNPR(totals.finalTotalPaisa)}). Awaiting manual payment submission.`,
          actorName: customer.fullName,
          timestamp: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      orderId,
      orderNumber,
      customerId: customer.id,
      customerName: customer.fullName,
      paymentMethodCode: paymentMethod.code,
      paymentMethodName: paymentMethod.displayName,
      expectedAmountPaisa: totals.finalTotalPaisa,
      currency: 'NPR',
      transactionReferenceRaw: null,
      transactionReferenceNormalized: null,
      senderPhoneOrAccount: '',
      evidenceStorageKey: '',
      customerRemarks: '',
      status: 'Unpaid',
      reviewedByUserId: null,
      reviewedByName: '',
      reviewDecisionReason: '',
      reviewedAt: null,
      idempotencyApprovalKey: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (promoRule && totals.promoApplied) {
      this.promoRedemptions.push({
        id: `red_${crypto.randomBytes(6).toString('hex')}`,
        promotionCode: promoRule.code,
        customerId: customer.id,
        orderId: order.id,
        discountPaisa: totals.discountPaisa,
        createdAt: nowIso,
      });
    }

    this.orders.unshift(order);
    this.payments.unshift(payment);

    this.notifyUser({
      recipientUserId: customer.id,
      templateKey: 'order_placed',
      variables: {
        orderNumber: order.orderNumber,
        amountNPR: formatNPR(order.finalTotalPaisa),
      },
    });

    return { order, payment };
  }

  // ============================================================================
  // MANUAL PAYMENT SUBMISSION & DUPLICATE REFERENCE PREVENTION
  // ============================================================================
  public submitManualPaymentProof(params: {
    customerId: string;
    orderId: string;
    transactionReference: string;
    senderPhoneOrAccount: string;
    customerRemarks?: string;
    receiptFilename?: string;
    receiptMimeType?: string;
    receiptSizeBytes?: number;
  }): PaymentRecord {
    const order = this.orders.find((o) => o.id === params.orderId);
    if (!order) {
      throw new Error('Order not found.');
    }
    if (order.customerId !== params.customerId) {
      throw new Error('Forbidden: You can only submit payment proof for your own orders.');
    }
    const payment = this.payments.find((p) => p.id === order.paymentId);
    if (!payment) {
      throw new Error('Payment record not found.');
    }
    if (payment.status === 'Approved' || payment.status === 'Refunded') {
      throw new Error('Cannot modify an already approved or refunded payment record.');
    }

    const rawRef = sanitizeStringInput(params.transactionReference, 80);
    const normalizedRef = normalizePaymentReference(rawRef);
    if (normalizedRef.length < 5) {
      throw new Error('Transaction reference must be at least 5 alphanumeric characters.');
    }

    // Unique index check across all payments
    const duplicate = this.payments.find(
      (p) => p.id !== payment.id && p.transactionReferenceNormalized === normalizedRef
    );
    if (duplicate) {
      throw new Error(
        `Duplicate payment reference detected ("${rawRef}"). A transaction reference can only be used once.`
      );
    }

    const storageObj = prepareSafeStorageObject({
      purpose: 'payment_receipt',
      originalFilename: params.receiptFilename || 'payment_receipt.jpg',
      mimeType: params.receiptMimeType || 'image/jpeg',
      sizeBytes: params.receiptSizeBytes || 140000,
      ownerId: params.customerId,
    });

    const nowIso = new Date().toISOString();
    payment.transactionReferenceRaw = rawRef;
    payment.transactionReferenceNormalized = normalizedRef;
    payment.senderPhoneOrAccount = sanitizeStringInput(params.senderPhoneOrAccount, 80);
    payment.customerRemarks = sanitizeStringInput(params.customerRemarks || '', 300);
    payment.evidenceStorageKey = storageObj.storageKey;
    payment.status = 'Payment Submitted';
    payment.updatedAt = nowIso;

    order.paymentStatus = 'Payment Submitted';
    order.orderStatus = 'Payment Under Review';
    order.updatedAt = nowIso;
    order.timeline.push({
      status: 'Payment Under Review',
      note: `Manual payment proof submitted (Ref: ${rawRef}). Queued for Payment Admin verification.`,
      actorName: order.customerName,
      timestamp: nowIso,
    });

    this.notifyUser({
      recipientUserId: order.customerId,
      templateKey: 'payment_submitted',
      variables: {
        orderNumber: order.orderNumber,
        referenceMasked: rawRef,
        amountNPR: formatNPR(order.finalTotalPaisa),
      },
    });

    return payment;
  }

  // ============================================================================
  // PAYMENT ADMIN VERIFICATION (APPROVE / REJECT) WITH IDEMPOTENCY & LEDGER
  // ============================================================================
  public reviewManualPayment(params: {
    actorId: string;
    paymentId: string;
    decision: 'Approved' | 'Rejected';
    reason: string;
    idempotencyKey?: string;
  }): { payment: PaymentRecord; order: OrderRecord } {
    const requiredPerm: PermissionCode =
      params.decision === 'Approved' ? 'payments:approve' : 'payments:reject';
    const actor = this.assertPermission(params.actorId, requiredPerm);

    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('A clear verification note or rejection reason (min 5 characters) is mandatory.');
    }

    const payment = this.payments.find((p) => p.id === params.paymentId);
    if (!payment) {
      throw new Error('Payment record not found.');
    }
    const order = this.orders.find((o) => o.id === payment.orderId);
    if (!order) {
      throw new Error('Associated order not found.');
    }

    // Idempotent & atomic lock check to prevent duplicate ledger entries on repeated requests
    if (this.paymentApprovalLocks.has(payment.id)) {
      throw new Error('Payment review is already in progress concurrently.');
    }
    if (payment.status === 'Approved' && params.decision === 'Approved') {
      throw new Error('Payment is already approved. Duplicate approval and duplicate ledger creation prevented.');
    }
    if (payment.status !== 'Payment Submitted' && payment.status !== 'Under Review') {
      throw new Error(`Payment in status "${payment.status}" cannot be reviewed.`);
    }

    this.paymentApprovalLocks.add(payment.id);
    try {
      const nowIso = new Date().toISOString();
      const prevStatus = payment.status;
      payment.status = params.decision;
      payment.reviewedByUserId = actor.id;
      payment.reviewedByName = actor.fullName;
      payment.reviewDecisionReason = sanitizeStringInput(params.reason, 400);
      payment.reviewedAt = nowIso;
      payment.idempotencyApprovalKey = params.idempotencyKey || `idem_${payment.id}_${nowIso}`;
      payment.updatedAt = nowIso;

      order.paymentStatus = params.decision;
      if (params.decision === 'Approved') {
        order.orderStatus = 'Awaiting Fulfillment';
        order.timeline.push({
          status: 'Awaiting Fulfillment',
          note: `Payment approved by ${actor.fullName}. Note: ${payment.reviewDecisionReason}`,
          actorName: actor.fullName,
          timestamp: nowIso,
        });

        // Create idempotent Financial Ledger Entries
        const ledgerIdemKey = `pay_approved_${order.id}`;
        if (!this.ledger.some((l) => l.idempotencyKey === ledgerIdemKey)) {
          const seq = 1000 + this.ledger.length + 1;
          this.ledger.unshift(
            {
              id: `led_${crypto.randomBytes(5).toString('hex')}`,
              entryNumber: `LED-${seq}-PAY`,
              idempotencyKey: ledgerIdemKey,
              orderId: order.id,
              orderNumber: order.orderNumber,
              vendorId: order.vendorId,
              entryType: 'payment_verified',
              direction: 'credit',
              amountPaisa: order.finalTotalPaisa,
              currency: 'NPR',
              description: `Verified manual payment (${payment.paymentMethodName}) for ${order.orderNumber}`,
              actorUserId: actor.id,
              createdAt: nowIso,
            },
            {
              id: `led_${crypto.randomBytes(5).toString('hex')}`,
              entryNumber: `LED-${seq}-COM`,
              idempotencyKey: `comm_${order.id}`,
              orderId: order.id,
              orderNumber: order.orderNumber,
              vendorId: order.vendorId,
              entryType: 'marketplace_commission',
              direction: 'credit',
              amountPaisa: order.marketplaceCommissionPaisa,
              currency: 'NPR',
              description: `Marketplace ${order.commissionRatePercent}% commission on ${order.orderNumber}`,
              actorUserId: actor.id,
              createdAt: nowIso,
            },
            {
              id: `led_${crypto.randomBytes(5).toString('hex')}`,
              entryNumber: `LED-${seq}-VND`,
              idempotencyKey: `vnd_earn_${order.id}`,
              orderId: order.id,
              orderNumber: order.orderNumber,
              vendorId: order.vendorId,
              entryType: 'vendor_earning_credit',
              direction: 'credit',
              amountPaisa: order.vendorNetEarningPaisa,
              currency: 'NPR',
              description: `Pending vendor earning credited for ${order.orderNumber}`,
              actorUserId: actor.id,
              createdAt: nowIso,
            }
          );

          const vendor = this.vendors.find((v) => v.id === order.vendorId);
          if (vendor) {
            vendor.pendingEarningsPaisa += order.vendorNetEarningPaisa;
          }
        }
      } else {
        order.orderStatus = 'Pending Payment';
        order.timeline.push({
          status: 'Pending Payment',
          note: `Payment rejected by ${actor.fullName}. Reason: ${payment.reviewDecisionReason}`,
          actorName: actor.fullName,
          timestamp: nowIso,
        });
      }
      order.updatedAt = nowIso;

      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: `PAYMENT_${params.decision.toUpperCase()}`,
        targetRecordType: 'Payment',
        targetRecordId: payment.id,
        reason: payment.reviewDecisionReason,
        beforeSummary: `status=${prevStatus}`,
        afterSummary: `status=${payment.status}, order=${order.orderStatus}`,
      });

      this.notifyUser({
        recipientUserId: order.customerId,
        templateKey: 'payment_decision',
        variables: {
          orderNumber: order.orderNumber,
          amountNPR: formatNPR(order.finalTotalPaisa),
          status: params.decision,
          reason: payment.reviewDecisionReason,
        },
      });

      return { payment, order };
    } finally {
      this.paymentApprovalLocks.delete(payment.id);
    }
  }

  // ============================================================================
  // MANUAL FULFILLMENT WORKFLOW (NO UNPAID DELIVERY, NO DUPLICATE FULFILLMENT)
  // ============================================================================
  public executeManualFulfillment(params: {
    actorId: string;
    orderId: string;
    deliveryReference: string;
    deliveryNotes: string;
    internalStaffNotes?: string;
    secretCodePlain?: string;
    inventoryItemId?: string;
  }): { fulfillment: FulfillmentRecord; order: OrderRecord } {
    const actor = this.users.find((u) => u.id === params.actorId);
    if (!actor || actor.status !== 'active') {
      throw new Error('Unauthorized actor.');
    }

    const order = this.orders.find((o) => o.id === params.orderId);
    if (!order) {
      throw new Error('Order not found.');
    }

    const isOrderVendor = actor.roles.includes('vendor') && actor.vendorId === order.vendorId;
    const hasAdminFulfillmentPerm = hasPermission(actor.roles, 'fulfillment:execute', this.roles);

    if (!isOrderVendor && !hasAdminFulfillmentPerm) {
      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: 'UNAUTHORIZED_FULFILLMENT_ATTEMPT',
        targetRecordType: 'Order',
        targetRecordId: order.id,
        reason: 'Actor attempted to fulfill an order belonging to another vendor or without fulfillment permission.',
      });
      throw new Error('Forbidden: You are not authorized to fulfill this order.');
    }

    // Strict check: Unpaid orders cannot be delivered
    if (order.paymentStatus !== 'Approved') {
      throw new Error(
        `Cannot fulfill order "${order.orderNumber}" while payment status is "${order.paymentStatus}". Manual payment must be Approved first.`
      );
    }

    // Prevent concurrent or duplicate fulfillment of the same order
    if (this.fulfillmentLocks.has(order.id)) {
      throw new Error('Fulfillment is already executing concurrently for this order.');
    }
    if (
      order.fulfillmentId ||
      order.orderStatus === 'Delivered' ||
      order.orderStatus === 'Completed' ||
      this.fulfillments.some((f) => f.orderId === order.id)
    ) {
      throw new Error(`Order "${order.orderNumber}" has already been fulfilled. Duplicate delivery prevented.`);
    }

    const transitionCheck = validateOrderStatusTransition(
      order.orderStatus,
      'Delivered',
      order.paymentStatus
    );
    if (!transitionCheck.valid) {
      throw new Error(transitionCheck.reason || 'Invalid order status transition.');
    }

    const cleanDeliveryRef = sanitizeStringInput(params.deliveryReference, 100);
    if (cleanDeliveryRef.length < 4) {
      throw new Error('Official delivery reference (min 4 characters) is required.');
    }
    if (this.fulfillments.some((f) => f.deliveryReference.toLowerCase() === cleanDeliveryRef.toLowerCase())) {
      throw new Error(`Delivery reference "${cleanDeliveryRef}" has already been used on another fulfillment.`);
    }

    this.fulfillmentLocks.add(order.id);
    try {
      let secretEncrypted: string | null = null;
      let secretMasked: string | null = null;

      if (params.inventoryItemId) {
        const inv = this.digitalInventory.find((i) => i.id === params.inventoryItemId);
        if (!inv || inv.status !== 'available') {
          throw new Error('Selected digital inventory code is not available.');
        }
        if (inv.vendorId !== order.vendorId && !hasAdminFulfillmentPerm) {
          throw new Error('Cannot allocate inventory belonging to another vendor.');
        }
        inv.status = 'allocated';
        inv.reservedOrderId = order.id;
        secretEncrypted = inv.secretCodeEncrypted;
        secretMasked = inv.secretCodeMasked;
      } else if (params.secretCodePlain && params.secretCodePlain.trim()) {
        const plain = params.secretCodePlain.trim();
        secretEncrypted = encryptSecretDeliveryCode(plain);
        secretMasked = maskSecretCode(plain);
      }

      const nowIso = new Date().toISOString();
      const fulfillment: FulfillmentRecord = {
        id: `ful_${crypto.randomBytes(6).toString('hex')}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorId: order.vendorId,
        customerId: order.customerId,
        assignedStaffOrVendorUserId: actor.id,
        fulfilledByName: actor.fullName,
        deliveryReference: cleanDeliveryRef,
        deliveryNotes: sanitizeStringInput(params.deliveryNotes, 500),
        internalStaffNotes: sanitizeStringInput(params.internalStaffNotes || '', 500),
        secretCodeEncrypted: secretEncrypted,
        secretCodeMasked: secretMasked,
        evidenceStorageKey: `private/fulfillment_evidence/${nowIso.slice(0, 10)}/${order.id}_delivery.png`,
        status: 'Delivered',
        deliveredAt: nowIso,
      };

      this.fulfillments.unshift(fulfillment);
      order.fulfillmentId = fulfillment.id;
      order.orderStatus = 'Delivered';
      order.updatedAt = nowIso;
      order.timeline.push({
        status: 'Delivered',
        note: `Manually fulfilled by ${actor.fullName} (Delivery Ref: ${cleanDeliveryRef}).`,
        actorName: actor.fullName,
        timestamp: nowIso,
      });

      // Move vendor earnings from pending to available upon fulfillment completion
      const vendor = this.vendors.find((v) => v.id === order.vendorId);
      if (vendor) {
        const transferable = Math.min(vendor.pendingEarningsPaisa, order.vendorNetEarningPaisa);
        vendor.pendingEarningsPaisa -= transferable;
        vendor.availableEarningsPaisa += order.vendorNetEarningPaisa;
      }

      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: 'ORDER_MANUALLY_FULFILLED',
        targetRecordType: 'Order',
        targetRecordId: order.id,
        reason: `Delivery reference: ${cleanDeliveryRef}`,
        beforeSummary: 'status=Awaiting Fulfillment',
        afterSummary: 'status=Delivered',
      });

      this.notifyUser({
        recipientUserId: order.customerId,
        templateKey: 'fulfillment_delivered',
        variables: {
          orderNumber: order.orderNumber,
          deliveryReference: cleanDeliveryRef,
        },
      });

      return { fulfillment, order };
    } finally {
      this.fulfillmentLocks.delete(order.id);
    }
  }

  /**
   * Protected Secret Code Retrieval — Restricted to the intended Customer or authorized Fulfillment Admin.
   */
  public revealProtectedOrderSecret(params: {
    actorId: string;
    orderId: string;
  }): { plainSecretCode: string; deliveryReference: string } {
    const actor = this.users.find((u) => u.id === params.actorId);
    if (!actor || actor.status !== 'active') {
      throw new Error('Unauthorized: Sign in required.');
    }
    const fulfillment = this.fulfillments.find((f) => f.orderId === params.orderId);
    if (!fulfillment || !fulfillment.secretCodeEncrypted) {
      throw new Error('No protected secret code is attached to this order.');
    }

    const isIntendedCustomer = fulfillment.customerId === actor.id;
    const hasSecretPerm = hasPermission(actor.roles, 'fulfillment:view_secrets', this.roles);

    if (!isIntendedCustomer && !hasSecretPerm) {
      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: 'UNAUTHORIZED_SECRET_CODE_ACCESS_BLOCKED',
        targetRecordType: 'FulfillmentRecord',
        targetRecordId: fulfillment.id,
        reason: 'Actor attempted to reveal secret delivery code without authorization.',
      });
      throw new Error('Forbidden: Only the purchasing customer or authorized fulfillment admin may reveal this code.');
    }

    const plainSecretCode = decryptSecretDeliveryCode(fulfillment.secretCodeEncrypted);
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'SECRET_DELIVERY_CODE_REVEALED',
      targetRecordType: 'FulfillmentRecord',
      targetRecordId: fulfillment.id,
      reason: isIntendedCustomer ? 'Customer revealed purchased digital code' : 'Authorized staff revealed code',
    });

    return {
      plainSecretCode,
      deliveryReference: fulfillment.deliveryReference,
    };
  }

  // ============================================================================
  // KYC SUBMISSION, REVIEW & PRIVATE DOCUMENT ACCESS
  // ============================================================================
  public submitKycApplication(params: {
    userId: string;
    legalName: string;
    dateOfBirth: string;
    district: string;
    municipalityAddress: string;
    documentType: KycApplicationRecord['documentType'];
    documentNumberPlain: string;
    frontFilename: string;
    backFilename?: string;
  }): KycApplicationRecord {
    const user = this.users.find((u) => u.id === params.userId);
    if (!user) throw new Error('User not found.');
    if (!params.legalName.trim() || !params.documentNumberPlain.trim()) {
      throw new Error('Legal name and identity document number are required.');
    }

    const frontObj = prepareSafeStorageObject({
      purpose: 'kyc_document',
      originalFilename: params.frontFilename || 'citizenship_front.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 220000,
      ownerId: user.id,
    });
    const backObj = prepareSafeStorageObject({
      purpose: 'kyc_document',
      originalFilename: params.backFilename || 'citizenship_back.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 210000,
      ownerId: user.id,
    });

    const nowIso = new Date().toISOString();
    const existing = this.kycApplications.find((k) => k.userId === user.id);
    if (existing) {
      existing.legalName = sanitizeStringInput(params.legalName, 120);
      existing.dateOfBirth = sanitizeStringInput(params.dateOfBirth, 20);
      existing.district = sanitizeStringInput(params.district, 60);
      existing.municipalityAddress = sanitizeStringInput(params.municipalityAddress, 160);
      existing.documentType = params.documentType;
      existing.documentNumberMasked = maskDocumentNumber(params.documentNumberPlain);
      existing.documentNumberEncrypted = encryptSecretDeliveryCode(params.documentNumberPlain);
      existing.frontDocumentStorageKey = frontObj.storageKey;
      existing.backDocumentStorageKey = backObj.storageKey;
      existing.status = 'Submitted';
      existing.decisionHistory.push({
        status: 'Submitted',
        actorId: user.id,
        reason: 'Customer resubmitted KYC documents.',
        timestamp: nowIso,
      });
      user.kycStatus = 'Submitted';
      return existing;
    }

    const app: KycApplicationRecord = {
      id: `kyc_${crypto.randomBytes(6).toString('hex')}`,
      userId: user.id,
      customerEmail: user.email,
      legalName: sanitizeStringInput(params.legalName, 120),
      dateOfBirth: sanitizeStringInput(params.dateOfBirth, 20),
      country: 'Nepal',
      district: sanitizeStringInput(params.district, 60),
      municipalityAddress: sanitizeStringInput(params.municipalityAddress, 160),
      documentType: params.documentType,
      documentNumberMasked: maskDocumentNumber(params.documentNumberPlain),
      documentNumberEncrypted: encryptSecretDeliveryCode(params.documentNumberPlain),
      frontDocumentStorageKey: frontObj.storageKey,
      backDocumentStorageKey: backObj.storageKey,
      status: 'Submitted',
      assignedReviewerId: null,
      reviewNotes: '',
      rejectionReason: '',
      reviewedAt: null,
      decisionHistory: [
        {
          status: 'Submitted',
          actorId: user.id,
          reason: 'Customer submitted initial KYC application.',
          timestamp: nowIso,
        },
      ],
      createdAt: nowIso,
    };

    this.kycApplications.unshift(app);
    user.kycStatus = 'Submitted';
    return app;
  }

  public reviewKycApplication(params: {
    actorId: string;
    kycId: string;
    decision: 'Approved' | 'Rejected' | 'More Information Required';
    reason: string;
  }): KycApplicationRecord {
    const requiredPerm: PermissionCode =
      params.decision === 'Approved'
        ? 'kyc:approve'
        : params.decision === 'Rejected'
        ? 'kyc:reject'
        : 'kyc:review';
    const actor = this.assertPermission(params.actorId, requiredPerm);

    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('Mandatory review note or rejection reason (min 5 characters) is required for KYC decisions.');
    }

    const app = this.kycApplications.find((k) => k.id === params.kycId);
    if (!app) throw new Error('KYC application not found.');

    const prevStatus = app.status;
    const nowIso = new Date().toISOString();
    app.status = params.decision;
    app.assignedReviewerId = actor.id;
    app.reviewNotes = sanitizeStringInput(params.reason, 400);
    if (params.decision === 'Rejected') {
      app.rejectionReason = sanitizeStringInput(params.reason, 400);
    }
    app.reviewedAt = nowIso;
    app.decisionHistory.push({
      status: params.decision,
      actorId: actor.id,
      reason: app.reviewNotes,
      timestamp: nowIso,
    });

    const customer = this.users.find((u) => u.id === app.userId);
    if (customer) {
      customer.kycStatus = params.decision;
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: `KYC_${params.decision.toUpperCase().replaceAll(' ', '_')}`,
      targetRecordType: 'KycApplication',
      targetRecordId: app.id,
      reason: app.reviewNotes,
      beforeSummary: `status=${prevStatus}`,
      afterSummary: `status=${app.status}`,
    });

    this.notifyUser({
      recipientUserId: app.userId,
      templateKey: 'kyc_status_update',
      variables: {
        customerName: app.legalName,
        status: app.status,
        reason: app.reviewNotes,
      },
    });

    return app;
  }

  public getAuthorizedPrivateDocumentLink(params: {
    actorId: string;
    resourceOwnerId: string;
    storageKey: string;
    purpose: 'kyc_review' | 'payment_review' | 'fulfillment_evidence';
  }): { signedUrl: string; expiresAt: number } {
    const actor = this.users.find((u) => u.id === params.actorId);
    if (!actor || actor.status !== 'active') {
      throw new Error('Unauthorized actor.');
    }
    const check = authorizeAndCreateSignedDocumentUrl({
      actorId: actor.id,
      actorRoles: actor.roles,
      resourceOwnerId: params.resourceOwnerId,
      storageKey: params.storageKey,
      purpose: params.purpose,
      customRoles: this.roles,
    });

    if (!check.allowed || !check.signedUrl || !check.expiresAt) {
      this.recordAuditLog({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRoles: actor.roles,
        actionType: 'PRIVATE_DOCUMENT_ACCESS_DENIED',
        targetRecordType: 'PrivateStorageObject',
        targetRecordId: params.storageKey,
        reason: check.reason || 'Unauthorized private document access attempt.',
      });
      throw new Error(check.reason || 'Forbidden');
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'PRIVATE_DOCUMENT_SIGNED_URL_ISSUED',
      targetRecordType: 'PrivateStorageObject',
      targetRecordId: params.storageKey,
      reason: `Issued 5-minute signed URL for ${params.purpose}`,
    });

    return { signedUrl: check.signedUrl, expiresAt: check.expiresAt };
  }

  // ============================================================================
  // VENDOR APPLICATION, APPROVAL & PRODUCT SUBMISSION
  // ============================================================================
  public submitVendorApplication(params: {
    applicantUserId: string;
    shopName: string;
    businessRegNumber: string;
    panVatNumber: string;
    contactEmail: string;
    contactMobile: string;
    city: string;
    address: string;
    categories: string[];
    resellerAuthorizationStatement: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch: string;
  }): VendorRecord {
    const user = this.users.find((u) => u.id === params.applicantUserId);
    if (!user) throw new Error('Applicant user not found.');
    if (!params.shopName.trim() || !params.panVatNumber.trim()) {
      throw new Error('Shop name and PAN/VAT number are required.');
    }

    const slug = params.shopName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');

    const vendor: VendorRecord = {
      id: `vnd_${crypto.randomBytes(5).toString('hex')}`,
      ownerUserId: user.id,
      shopName: sanitizeStringInput(params.shopName, 120),
      slug,
      businessRegNumber: sanitizeStringInput(params.businessRegNumber, 60),
      panVatNumber: sanitizeStringInput(params.panVatNumber, 60),
      contactEmail: sanitizeStringInput(params.contactEmail, 120),
      contactMobile: sanitizeStringInput(params.contactMobile, 30),
      country: 'Nepal',
      city: sanitizeStringInput(params.city, 60),
      address: sanitizeStringInput(params.address, 160),
      categories: params.categories,
      resellerAuthorizationStatement: sanitizeStringInput(params.resellerAuthorizationStatement, 400),
      status: 'Pending Review',
      commissionRatePercent: this.globalCommissionRatePercent,
      pendingEarningsPaisa: 0,
      availableEarningsPaisa: 0,
      totalSettledPaisa: 0,
      bankPayoutDetails: {
        bankName: sanitizeStringInput(params.bankName, 80),
        accountName: sanitizeStringInput(params.accountName, 120),
        accountNumber: sanitizeStringInput(params.accountNumber, 50),
        branch: sanitizeStringInput(params.branch, 80),
      },
      reviewNotes: 'Submitted by applicant.',
      decisionReason: '',
      agreementAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.vendors.unshift(vendor);
    return vendor;
  }

  public reviewVendorApplication(params: {
    actorId: string;
    vendorId: string;
    decision: 'Approved' | 'Rejected' | 'Suspended';
    reason: string;
  }): VendorRecord {
    const permMap: Record<typeof params.decision, PermissionCode> = {
      Approved: 'vendors:approve',
      Rejected: 'vendors:reject',
      Suspended: 'vendors:suspend',
    };
    const actor = this.assertPermission(params.actorId, permMap[params.decision]);
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('Mandatory reason is required for vendor status decisions.');
    }

    const vendor = this.vendors.find((v) => v.id === params.vendorId);
    if (!vendor) throw new Error('Vendor not found.');

    const prevStatus = vendor.status;
    vendor.status = params.decision;
    vendor.decisionReason = sanitizeStringInput(params.reason, 400);

    const owner = this.users.find((u) => u.id === vendor.ownerUserId);
    if (owner && params.decision === 'Approved') {
      owner.vendorId = vendor.id;
      if (!owner.roles.includes('vendor')) {
        owner.roles.push('vendor');
      }
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: `VENDOR_${params.decision.toUpperCase()}`,
      targetRecordType: 'Vendor',
      targetRecordId: vendor.id,
      reason: vendor.decisionReason,
      beforeSummary: `status=${prevStatus}`,
      afterSummary: `status=${vendor.status}`,
    });

    this.notifyUser({
      recipientUserId: vendor.ownerUserId,
      templateKey: 'vendor_status_update',
      variables: {
        vendorName: vendor.shopName,
        status: vendor.status,
        reason: vendor.decisionReason,
      },
    });

    return vendor;
  }

  public submitVendorProduct(params: {
    actorId: string;
    vendorId: string;
    categoryId: string;
    subcategory: string;
    title: string;
    shortDescription: string;
    description: string;
    priceNPR: number;
    sourcingCostNPR?: number;
    expectedFulfillmentMinutes: number;
    regionRestriction: string;
    productTerms: string;
    resellerAuthorizedConfirmed: boolean;
    variantLabel: string;
    stockCount: number;
  }): ProductRecord {
    const actor = this.users.find((u) => u.id === params.actorId);
    if (!actor || actor.status !== 'active') throw new Error('Unauthorized.');

    const vendor = this.vendors.find((v) => v.id === params.vendorId);
    if (!vendor || vendor.status !== 'Approved') {
      throw new Error('Only approved vendors can submit products.');
    }
    const isAdminWithProductApprove = hasPermission(actor.roles, 'products:approve', this.roles);
    if (actor.vendorId !== vendor.id && !isAdminWithProductApprove) {
      throw new Error('Forbidden: Vendors cannot create or modify products for another vendor.');
    }
    if (!params.resellerAuthorizedConfirmed) {
      throw new Error('Vendor must explicitly confirm official reseller authorization for this product.');
    }

    const category = this.categories.find((c) => c.id === params.categoryId);
    if (!category) throw new Error('Invalid category.');

    const pricePaisa = nprToPaisa(params.priceNPR);
    if (pricePaisa <= 0) throw new Error('Selling price in NPR must be greater than zero.');

    const nowIso = new Date().toISOString();
    const productId = `prd_${crypto.randomBytes(5).toString('hex')}`;
    const slug = `${params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${productId.slice(-4)}`;

    const product: ProductRecord = {
      id: productId,
      slug,
      vendorId: vendor.id,
      vendorName: vendor.shopName,
      categoryId: category.id,
      categoryName: category.name,
      subcategory: sanitizeStringInput(params.subcategory || category.subcategories[0], 80),
      title: sanitizeStringInput(params.title, 140),
      shortDescription: sanitizeStringInput(params.shortDescription, 220),
      description: sanitizeStringInput(params.description, 1000),
      artworkType:
        category.id === 'cat_gaming'
          ? 'gaming_topup'
          : category.id === 'cat_giftcards'
          ? 'gift_card'
          : category.id === 'cat_software'
          ? 'software_license'
          : category.id === 'cat_recharge'
          ? 'telecom_recharge'
          : 'digital_ebook',
      pricePaisa,
      sourcingCostPaisa: nprToPaisa(params.sourcingCostNPR || 0),
      expectedFulfillmentMinutes: Math.max(5, Number(params.expectedFulfillmentMinutes) || 15),
      regionRestriction: sanitizeStringInput(params.regionRestriction || 'Nepal', 100),
      refundEligibility: 'Refundable Before Fulfillment or If Defective',
      productTerms: sanitizeStringInput(params.productTerms, 400),
      resellerAuthorizedConfirmed: true,
      authorizationEvidenceKey: `private/vendor_document/${nowIso.slice(0, 10)}/${vendor.id}_auth.pdf`,
      requiredCustomerFields: category.requiredCustomerFields,
      variants: [
        {
          variantId: `var_${crypto.randomBytes(4).toString('hex')}`,
          label: sanitizeStringInput(params.variantLabel || 'Standard Package', 80),
          pricePaisa,
          stockCount: Math.max(1, Number(params.stockCount) || 25),
          sku: `SKU-${productId.slice(-5).toUpperCase()}`,
        },
      ],
      approvalStatus: 'Pending Approval',
      rejectionReason: '',
      isFeatured: false,
      requiresCustomerKyc: pricePaisa >= this.kycHighValueThresholdPaisa,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.products.unshift(product);
    return product;
  }

  public reviewProductSubmission(params: {
    actorId: string;
    productId: string;
    decision: 'Approved' | 'Rejected' | 'Suspended';
    reason: string;
  }): ProductRecord {
    const permMap: Record<typeof params.decision, PermissionCode> = {
      Approved: 'products:approve',
      Rejected: 'products:reject',
      Suspended: 'products:suspend',
    };
    const actor = this.assertPermission(params.actorId, permMap[params.decision]);
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('Mandatory reason is required for product approval, rejection, or suspension.');
    }

    const product = this.products.find((p) => p.id === params.productId);
    if (!product) throw new Error('Product not found.');

    const prevStatus = product.approvalStatus;
    product.approvalStatus = params.decision;
    product.rejectionReason = params.decision === 'Approved' ? '' : sanitizeStringInput(params.reason, 300);
    product.updatedAt = new Date().toISOString();

    this.productApprovalHistory.unshift({
      id: `pah_${crypto.randomBytes(5).toString('hex')}`,
      productId: product.id,
      actorUserId: actor.id,
      previousStatus: prevStatus,
      newStatus: product.approvalStatus,
      reason: sanitizeStringInput(params.reason, 300),
      createdAt: product.updatedAt,
    });

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: `PRODUCT_${params.decision.toUpperCase()}`,
      targetRecordType: 'Product',
      targetRecordId: product.id,
      reason: params.reason,
      beforeSummary: `approvalStatus=${prevStatus}`,
      afterSummary: `approvalStatus=${product.approvalStatus}`,
    });

    return product;
  }

  // ============================================================================
  // REFUNDS & DISPUTES
  // ============================================================================
  public createRefundRequest(params: {
    customerId: string;
    orderId: string;
    reason: string;
  }): RefundRequestRecord {
    const order = this.orders.find((o) => o.id === params.orderId);
    if (!order) throw new Error('Order not found.');
    if (order.customerId !== params.customerId) {
      throw new Error('Forbidden: You can only request a refund for your own order.');
    }
    if (order.paymentStatus !== 'Approved') {
      throw new Error('Only paid orders are eligible for a financial refund request.');
    }
    if (this.refunds.some((r) => r.orderId === order.id && r.status !== 'Rejected')) {
      throw new Error('An active refund request already exists for this order.');
    }

    const nowIso = new Date().toISOString();
    const refund: RefundRequestRecord = {
      id: `ref_${crypto.randomBytes(5).toString('hex')}`,
      refundNumber: `REF-NP-${100 + this.refunds.length + 1}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      vendorId: order.vendorId,
      vendorName: order.vendorName,
      requestedAmountPaisa: order.finalTotalPaisa,
      approvedAmountPaisa: 0,
      reason: sanitizeStringInput(params.reason, 400),
      evidenceStorageKey: `private/payment_receipt/${nowIso.slice(0, 10)}/${order.id}_refund_claim.png`,
      status: 'Requested',
      assignedReviewerId: null,
      decisionReason: '',
      refundReference: '',
      completedAt: null,
      createdAt: nowIso,
    };

    order.orderStatus = 'Refund Requested';
    order.paymentStatus = 'Refund Requested';
    order.timeline.push({
      status: 'Refund Requested',
      note: `Customer submitted refund request: ${refund.reason}`,
      actorName: order.customerName,
      timestamp: nowIso,
    });

    this.refunds.unshift(refund);
    return refund;
  }

  public reviewRefundRequest(params: {
    actorId: string;
    refundId: string;
    decision: 'Completed' | 'Rejected';
    reason: string;
    refundReference?: string;
  }): RefundRequestRecord {
    const perm: PermissionCode = params.decision === 'Completed' ? 'refunds:approve' : 'refunds:reject';
    const actor = this.assertPermission(params.actorId, perm);
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('Decision reason is required.');
    }

    const refund = this.refunds.find((r) => r.id === params.refundId);
    if (!refund) throw new Error('Refund request not found.');
    if (refund.status === 'Completed') {
      throw new Error('Refund has already been completed.');
    }

    const order = this.orders.find((o) => o.id === refund.orderId);
    if (!order) throw new Error('Associated order not found.');

    const nowIso = new Date().toISOString();
    refund.status = params.decision;
    refund.assignedReviewerId = actor.id;
    refund.decisionReason = sanitizeStringInput(params.reason, 400);

    if (params.decision === 'Completed') {
      refund.approvedAmountPaisa = refund.requestedAmountPaisa;
      refund.refundReference = sanitizeStringInput(params.refundReference || `REV-${Date.now()}`, 80);
      refund.completedAt = nowIso;
      order.orderStatus = 'Refunded';
      order.paymentStatus = 'Refunded';
      order.timeline.push({
        status: 'Refunded',
        note: `Refund approved and completed by ${actor.fullName} (Ref: ${refund.refundReference}).`,
        actorName: actor.fullName,
        timestamp: nowIso,
      });

      // Record ledger reversal
      this.ledger.unshift({
        id: `led_${crypto.randomBytes(5).toString('hex')}`,
        entryNumber: `LED-${1000 + this.ledger.length + 1}-REF`,
        idempotencyKey: `refund_${refund.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorId: order.vendorId,
        entryType: 'refund_reversal',
        direction: 'debit',
        amountPaisa: refund.approvedAmountPaisa,
        currency: 'NPR',
        description: `Refund reversal completed for ${order.orderNumber} (Ref: ${refund.refundReference})`,
        actorUserId: actor.id,
        createdAt: nowIso,
      });

      const vendor = this.vendors.find((v) => v.id === order.vendorId);
      if (vendor) {
        vendor.availableEarningsPaisa = Math.max(
          0,
          vendor.availableEarningsPaisa - order.vendorNetEarningPaisa
        );
      }
    } else {
      order.orderStatus = order.fulfillmentId ? 'Delivered' : 'Awaiting Fulfillment';
      order.paymentStatus = 'Approved';
      order.timeline.push({
        status: order.orderStatus,
        note: `Refund request rejected by ${actor.fullName}: ${refund.decisionReason}`,
        actorName: actor.fullName,
        timestamp: nowIso,
      });
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: `REFUND_${params.decision.toUpperCase()}`,
      targetRecordType: 'RefundRequest',
      targetRecordId: refund.id,
      reason: refund.decisionReason,
      beforeSummary: 'status=Requested',
      afterSummary: `status=${refund.status}`,
    });

    return refund;
  }

  // ============================================================================
  // VENDOR SETTLEMENTS
  // ============================================================================
  public requestVendorSettlement(params: {
    actorId: string;
    vendorId: string;
    amountNPR: number;
  }): VendorSettlementRecord {
    const actor = this.users.find((u) => u.id === params.actorId);
    if (!actor || actor.vendorId !== params.vendorId) {
      throw new Error('Forbidden: Only the authorized vendor owner can request a settlement payout.');
    }
    const vendor = this.vendors.find((v) => v.id === params.vendorId);
    if (!vendor || vendor.status !== 'Approved') {
      throw new Error('Vendor must be Approved to request settlement.');
    }
    const amountPaisa = nprToPaisa(params.amountNPR);
    if (amountPaisa < this.minSettlementPayoutPaisa) {
      throw new Error(`Minimum settlement payout amount is ${formatNPR(this.minSettlementPayoutPaisa)}.`);
    }
    if (amountPaisa > vendor.availableEarningsPaisa) {
      throw new Error(
        `Requested amount (${formatNPR(amountPaisa)}) exceeds available balance (${formatNPR(vendor.availableEarningsPaisa)}).`
      );
    }

    vendor.availableEarningsPaisa -= amountPaisa;
    const settlement: VendorSettlementRecord = {
      id: `set_${crypto.randomBytes(5).toString('hex')}`,
      settlementNumber: `SET-NP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${100 + this.settlements.length + 1}`,
      vendorId: vendor.id,
      vendorName: vendor.shopName,
      requestedAmountPaisa: amountPaisa,
      bankDetailsSnapshot: `${vendor.bankPayoutDetails.bankName} — A/C ${vendor.bankPayoutDetails.accountNumber} (${vendor.bankPayoutDetails.branch})`,
      status: 'Settlement Requested',
      reviewedByUserId: null,
      payoutReference: '',
      decisionReason: '',
      paidAt: null,
      createdAt: new Date().toISOString(),
    };
    this.settlements.unshift(settlement);
    return settlement;
  }

  public processVendorSettlement(params: {
    actorId: string;
    settlementId: string;
    decision: 'Settlement Paid' | 'Settlement Rejected';
    payoutReference: string;
    reason: string;
  }): VendorSettlementRecord {
    const perm: PermissionCode =
      params.decision === 'Settlement Paid' ? 'settlements:pay' : 'settlements:reject';
    const actor = this.assertPermission(params.actorId, perm);

    const settlement = this.settlements.find((s) => s.id === params.settlementId);
    if (!settlement) throw new Error('Settlement request not found.');
    if (settlement.status === 'Settlement Paid' || settlement.status === 'Settlement Rejected') {
      throw new Error(`Settlement is already marked "${settlement.status}".`);
    }

    const vendor = this.vendors.find((v) => v.id === settlement.vendorId);
    const nowIso = new Date().toISOString();
    settlement.status = params.decision;
    settlement.reviewedByUserId = actor.id;
    settlement.decisionReason = sanitizeStringInput(params.reason, 300);

    if (params.decision === 'Settlement Paid') {
      if (!params.payoutReference || params.payoutReference.trim().length < 4) {
        throw new Error('Bank payout reference is required when marking a settlement paid.');
      }
      settlement.payoutReference = sanitizeStringInput(params.payoutReference, 80);
      settlement.paidAt = nowIso;
      if (vendor) {
        vendor.totalSettledPaisa += settlement.requestedAmountPaisa;
      }
      this.ledger.unshift({
        id: `led_${crypto.randomBytes(5).toString('hex')}`,
        entryNumber: `LED-${1000 + this.ledger.length + 1}-SET`,
        idempotencyKey: `settlement_paid_${settlement.id}`,
        orderId: null,
        orderNumber: '',
        vendorId: settlement.vendorId,
        entryType: 'vendor_settlement_payout',
        direction: 'debit',
        amountPaisa: settlement.requestedAmountPaisa,
        currency: 'NPR',
        description: `Vendor settlement paid to ${settlement.vendorName} (Ref: ${settlement.payoutReference})`,
        actorUserId: actor.id,
        createdAt: nowIso,
      });
    } else if (vendor) {
      vendor.availableEarningsPaisa += settlement.requestedAmountPaisa;
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: `SETTLEMENT_${params.decision.toUpperCase().replaceAll(' ', '_')}`,
      targetRecordType: 'VendorSettlementRequest',
      targetRecordId: settlement.id,
      reason: settlement.decisionReason,
      afterSummary: `status=${settlement.status}, ref=${settlement.payoutReference}`,
    });

    return settlement;
  }

  // ============================================================================
  // RBAC ROLE CREATION & ASSIGNMENT (WITH LOCKOUT & ESCALATION PROTECTION)
  // ============================================================================
  public assignUserRoles(params: {
    actorId: string;
    targetUserId: string;
    newRoles: string[];
    reason: string;
  }): Omit<UserAccount, 'passwordHash'> {
    const actor = this.assertPermission(params.actorId, 'admins:manage_roles');
    const target = this.users.find((u) => u.id === params.targetUserId);
    if (!target) throw new Error('Target user not found.');

    const superAdminCount = this.users.filter(
      (u) => u.status === 'active' && u.roles.includes('super_admin')
    ).length;

    const check = canModifyRoleAssignment(
      actor.roles,
      target.roles,
      params.newRoles,
      superAdminCount
    );
    if (!check.allowed) {
      throw new Error(check.reason || 'Role assignment forbidden.');
    }

    const beforeRoles = [...target.roles];
    target.roles = params.newRoles;

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'USER_ROLES_UPDATED',
      targetRecordType: 'User',
      targetRecordId: target.id,
      reason: params.reason || 'Role assignment updated by Super Admin',
      beforeSummary: beforeRoles.join(','),
      afterSummary: target.roles.join(','),
    });

    const { passwordHash: _omitted, ...safeUser } = target;
    return safeUser;
  }

  public createCustomRole(params: {
    actorId: string;
    code: string;
    name: string;
    description: string;
    permissions: PermissionCode[];
  }): RoleDefinition {
    const actor = this.assertPermission(params.actorId, 'roles:create');
    const cleanCode = params.code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    if (this.roles.some((r) => r.code === cleanCode)) {
      throw new Error(`Role with code "${cleanCode}" already exists.`);
    }

    const role: RoleDefinition = {
      code: cleanCode,
      name: sanitizeStringInput(params.name, 80),
      description: sanitizeStringInput(params.description, 240),
      isSystemRole: false,
      isAdminRole: true,
      permissions: params.permissions,
    };
    this.roles.push(role);

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'CUSTOM_ROLE_CREATED',
      targetRecordType: 'Role',
      targetRecordId: role.code,
      reason: `Created custom role ${role.name}`,
      afterSummary: `permissions=${role.permissions.join(',')}`,
    });

    return role;
  }

  // ============================================================================
  // EXECUTIVE METRICS & FINANCIAL RECONCILIATION ANALYTICS
  // ============================================================================
  public getDashboardMetrics() {
    const paidOrders = this.orders.filter(
      (o) =>
        o.paymentStatus === 'Approved' ||
        o.paymentStatus === 'Refund Requested' ||
        o.paymentStatus === 'Refunded'
    );
    const grossSalesPaisa = paidOrders.reduce((acc, o) => acc + o.subtotalPaisa, 0);
    const totalDiscountsPaisa = paidOrders.reduce((acc, o) => acc + o.discountPaisa, 0);
    const completedRefundsPaisa = this.refunds
      .filter((r) => r.status === 'Completed')
      .reduce((acc, r) => acc + r.approvedAmountPaisa, 0);
    const netSalesPaisa = Math.max(0, grossSalesPaisa - totalDiscountsPaisa - completedRefundsPaisa);

    const activePaidOrders = this.orders.filter((o) => o.paymentStatus === 'Approved');
    const marketplaceCommissionRevenuePaisa = activePaidOrders.reduce(
      (acc, o) => acc + o.marketplaceCommissionPaisa,
      0
    );
    const vendorNetEarningsTotalPaisa = activePaidOrders.reduce(
      (acc, o) => acc + o.vendorNetEarningPaisa,
      0
    );
    const outstandingVendorLiabilitiesPaisa = this.vendors.reduce(
      (acc, v) => acc + v.pendingEarningsPaisa + v.availableEarningsPaisa,
      0
    );

    return {
      totalCustomers: this.users.filter((u) => u.roles.includes('customer')).length,
      pendingCustomerKyc: this.kycApplications.filter(
        (k) => k.status === 'Submitted' || k.status === 'Under Review'
      ).length,
      totalVendors: this.vendors.length,
      approvedVendors: this.vendors.filter((v) => v.status === 'Approved').length,
      pendingVendorApprovals: this.vendors.filter(
        (v) => v.status === 'Pending Review' || v.status === 'Under Review'
      ).length,
      activeProducts: this.products.filter((p) => p.approvalStatus === 'Approved').length,
      pendingProductApprovals: this.products.filter((p) => p.approvalStatus === 'Pending Approval').length,
      totalOrders: this.orders.length,
      paymentsAwaitingReview: this.payments.filter(
        (p) => p.status === 'Payment Submitted' || p.status === 'Under Review'
      ).length,
      ordersAwaitingFulfillment: this.orders.filter(
        (o) => o.orderStatus === 'Awaiting Fulfillment' || o.orderStatus === 'Processing'
      ).length,
      completedOrders: this.orders.filter(
        (o) => o.orderStatus === 'Delivered' || o.orderStatus === 'Completed'
      ).length,
      cancelledOrders: this.orders.filter((o) => o.orderStatus === 'Cancelled').length,
      pendingRefundRequests: this.refunds.filter(
        (r) => r.status === 'Requested' || r.status === 'Under Review'
      ).length,
      openSupportTickets: this.supportTickets.filter((t) => t.status !== 'Resolved').length,
      financialSummary: {
        grossSalesPaisa,
        totalDiscountsPaisa,
        completedRefundsPaisa,
        netSalesPaisa,
        marketplaceCommissionRevenuePaisa,
        vendorNetEarningsTotalPaisa,
        outstandingVendorLiabilitiesPaisa,
      },
      environmentStatus: {
        mongodbAtlasConfigured: isMongoUriConfigured(),
        objectStorageConfigured: isObjectStorageConfigured(),
        emailProviderConfigured: isEmailProviderConfigured(),
        futureGateways: FUTURE_NEPAL_GATEWAY_STATUS,
        timezone: 'Asia/Kathmandu',
        currency: 'NPR',
      },
      allPermissionsCatalog: ALL_PERMISSIONS,
    };
  }
}

export const marketplaceStore = new MarketplaceStore();
