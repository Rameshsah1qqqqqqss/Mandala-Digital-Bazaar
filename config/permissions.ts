/**
 * Granular Server-Enforced Role-Based Access Control (RBAC)
 * Supports all 12 initial administrative roles plus customer, vendor, and custom roles.
 */

export type SystemRoleCode =
  | 'super_admin'
  | 'support_admin'
  | 'kyc_admin'
  | 'vendor_admin'
  | 'payment_admin'
  | 'product_admin'
  | 'fulfillment_admin'
  | 'promotions_admin'
  | 'finance_admin'
  | 'reports_admin'
  | 'content_admin'
  | 'security_admin'
  | 'vendor'
  | 'customer';

export type PermissionCode =
  // Users & Admins
  | 'users:view'
  | 'users:edit'
  | 'users:suspend'
  | 'admins:view'
  | 'admins:create'
  | 'admins:manage_roles'
  | 'roles:view'
  | 'roles:create'
  | 'roles:edit'
  // KYC Verification
  | 'kyc:view'
  | 'kyc:view_documents'
  | 'kyc:review'
  | 'kyc:approve'
  | 'kyc:reject'
  // Vendors
  | 'vendors:view'
  | 'vendors:review'
  | 'vendors:approve'
  | 'vendors:reject'
  | 'vendors:suspend'
  // Products & Inventory
  | 'products:view_all'
  | 'products:create'
  | 'products:edit'
  | 'products:approve'
  | 'products:reject'
  | 'products:suspend'
  | 'inventory:view'
  | 'inventory:manage'
  // Payments
  | 'payments:view'
  | 'payments:view_evidence'
  | 'payments:approve'
  | 'payments:reject'
  | 'payment_methods:manage'
  // Orders & Manual Fulfillment
  | 'orders:view_all'
  | 'orders:manage_status'
  | 'fulfillment:view'
  | 'fulfillment:execute'
  | 'fulfillment:view_secrets'
  // Refunds & Disputes
  | 'refunds:view'
  | 'refunds:review'
  | 'refunds:approve'
  | 'refunds:reject'
  // Promotions
  | 'promotions:view'
  | 'promotions:create'
  | 'promotions:edit'
  // Finance, Commissions & Settlements
  | 'finance:view_ledger'
  | 'finance:manage_commissions'
  | 'settlements:view'
  | 'settlements:approve'
  | 'settlements:pay'
  | 'settlements:reject'
  // Support Tickets
  | 'support:view_all'
  | 'support:reply'
  | 'support:assign'
  | 'support:resolve'
  // Reports & Analytics
  | 'reports:view'
  | 'reports:export'
  // Content & Branding
  | 'content:view'
  | 'content:edit'
  | 'settings:manage_branding'
  | 'settings:manage_security'
  // Security & Audit Logs
  | 'audit:view'
  | 'audit:export';

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  isAdminRole: boolean;
  permissions: PermissionCode[];
}

export const ALL_PERMISSIONS: Array<{
  code: PermissionCode;
  module: string;
  action: string;
  description: string;
}> = [
  { code: 'users:view', module: 'Users', action: 'View', description: 'View customer accounts and profiles' },
  { code: 'users:edit', module: 'Users', action: 'Edit', description: 'Update customer profile metadata' },
  { code: 'users:suspend', module: 'Users', action: 'Suspend', description: 'Suspend or reactivate customer accounts' },
  { code: 'admins:view', module: 'Administration', action: 'View', description: 'View administrative staff accounts' },
  { code: 'admins:create', module: 'Administration', action: 'Create', description: 'Invite or create new administrators' },
  { code: 'admins:manage_roles', module: 'Administration', action: 'Manage Permissions', description: 'Assign roles and permissions to administrators' },
  { code: 'roles:view', module: 'RBAC', action: 'View', description: 'View roles and permission matrices' },
  { code: 'roles:create', module: 'RBAC', action: 'Create', description: 'Create custom administrative roles' },
  { code: 'roles:edit', module: 'RBAC', action: 'Edit', description: 'Modify custom role permissions' },
  { code: 'kyc:view', module: 'KYC', action: 'View', description: 'View customer KYC verification queue' },
  { code: 'kyc:view_documents', module: 'KYC', action: 'View Documents', description: 'Generate short-lived signed links for private KYC identity documents' },
  { code: 'kyc:review', module: 'KYC', action: 'Edit', description: 'Assign KYC reviewer and request more information' },
  { code: 'kyc:approve', module: 'KYC', action: 'Approve', description: 'Approve customer KYC identity applications' },
  { code: 'kyc:reject', module: 'KYC', action: 'Reject', description: 'Reject customer KYC applications with mandatory reason' },
  { code: 'vendors:view', module: 'Vendors', action: 'View', description: 'View vendor applications and profiles' },
  { code: 'vendors:review', module: 'Vendors', action: 'Edit', description: 'Place vendor applications under review and add notes' },
  { code: 'vendors:approve', module: 'Vendors', action: 'Approve', description: 'Approve vendor applications for selling' },
  { code: 'vendors:reject', module: 'Vendors', action: 'Reject', description: 'Reject vendor applications with reason' },
  { code: 'vendors:suspend', module: 'Vendors', action: 'Suspend', description: 'Suspend or deactivate approved vendors' },
  { code: 'products:view_all', module: 'Products', action: 'View', description: 'View all vendor products including drafts and pending submissions' },
  { code: 'products:create', module: 'Products', action: 'Create', description: 'Create or submit products' },
  { code: 'products:edit', module: 'Products', action: 'Edit', description: 'Edit product catalog attributes' },
  { code: 'products:approve', module: 'Products', action: 'Approve', description: 'Approve vendor product submissions for public listing' },
  { code: 'products:reject', module: 'Products', action: 'Reject', description: 'Reject vendor products with mandatory reason' },
  { code: 'products:suspend', module: 'Products', action: 'Suspend', description: 'Suspend published products' },
  { code: 'inventory:view', module: 'Inventory', action: 'View', description: 'View digital code inventory metadata' },
  { code: 'inventory:manage', module: 'Inventory', action: 'Edit', description: 'Add or reserve authorized digital codes' },
  { code: 'payments:view', module: 'Payments', action: 'View', description: 'View manual payment verification queue' },
  { code: 'payments:view_evidence', module: 'Payments', action: 'View Evidence', description: 'Inspect uploaded payment receipt evidence' },
  { code: 'payments:approve', module: 'Payments', action: 'Approve', description: 'Approve verified manual payments and unlock fulfillment' },
  { code: 'payments:reject', module: 'Payments', action: 'Reject', description: 'Reject unverified or invalid payment submissions' },
  { code: 'payment_methods:manage', module: 'Payments', action: 'Edit', description: 'Configure manual payment methods (Bank, QR, Wallet)' },
  { code: 'orders:view_all', module: 'Orders', action: 'View', description: 'View all marketplace orders' },
  { code: 'orders:manage_status', module: 'Orders', action: 'Edit', description: 'Execute validated order status transitions' },
  { code: 'fulfillment:view', module: 'Fulfillment', action: 'View', description: 'View manual fulfillment queue' },
  { code: 'fulfillment:execute', module: 'Fulfillment', action: 'Approve', description: 'Complete manual order delivery and record delivery reference' },
  { code: 'fulfillment:view_secrets', module: 'Fulfillment', action: 'View Secrets', description: 'Access protected secret delivery codes for authorized fulfillment' },
  { code: 'refunds:view', module: 'Refunds', action: 'View', description: 'View customer refund and dispute requests' },
  { code: 'refunds:review', module: 'Refunds', action: 'Edit', description: 'Review refund evidence and add notes' },
  { code: 'refunds:approve', module: 'Refunds', action: 'Refund', description: 'Approve financial refund reversals' },
  { code: 'refunds:reject', module: 'Refunds', action: 'Reject', description: 'Reject ineligible refund requests' },
  { code: 'promotions:view', module: 'Promotions', action: 'View', description: 'View promo codes and discount rules' },
  { code: 'promotions:create', module: 'Promotions', action: 'Create', description: 'Create new promotional campaigns' },
  { code: 'promotions:edit', module: 'Promotions', action: 'Edit', description: 'Enable, disable, or edit promotional campaigns' },
  { code: 'finance:view_ledger', module: 'Finance', action: 'View', description: 'View immutable financial ledger and commission records' },
  { code: 'finance:manage_commissions', module: 'Finance', action: 'Edit', description: 'Configure global, category, and vendor commission rules' },
  { code: 'settlements:view', module: 'Finance', action: 'View', description: 'View vendor settlement payout requests' },
  { code: 'settlements:approve', module: 'Finance', action: 'Approve', description: 'Approve vendor settlement requests' },
  { code: 'settlements:pay', module: 'Finance', action: 'Edit', description: 'Record manual payout completion and bank reference' },
  { code: 'settlements:reject', module: 'Finance', action: 'Reject', description: 'Reject vendor settlement requests with reason' },
  { code: 'support:view_all', module: 'Support', action: 'View', description: 'View all customer and vendor support tickets' },
  { code: 'support:reply', module: 'Support', action: 'Create', description: 'Reply to support tickets and add internal notes' },
  { code: 'support:assign', module: 'Support', action: 'Edit', description: 'Assign support tickets to staff' },
  { code: 'support:resolve', module: 'Support', action: 'Approve', description: 'Resolve or escalate support tickets' },
  { code: 'reports:view', module: 'Reports', action: 'View', description: 'View financial, sales, KYC, and operational reports' },
  { code: 'reports:export', module: 'Reports', action: 'Export', description: 'Export authorized report data with audit logging' },
  { code: 'content:view', module: 'Content', action: 'View', description: 'View content pages and notification templates' },
  { code: 'content:edit', module: 'Content', action: 'Edit', description: 'Edit legal pages, FAQs, banners, and notification templates' },
  { code: 'settings:manage_branding', module: 'Settings', action: 'Edit', description: 'Update marketplace branding and contact settings' },
  { code: 'settings:manage_security', module: 'Settings', action: 'Manage Permissions', description: 'Modify platform security and KYC policy thresholds' },
  { code: 'audit:view', module: 'Security', action: 'View', description: 'Search and inspect immutable administrative audit logs' },
  { code: 'audit:export', module: 'Security', action: 'Export', description: 'Export security audit logs' },
];

export const INITIAL_ROLES: RoleDefinition[] = [
  {
    code: 'super_admin',
    name: 'Super Admin',
    description: 'Full platform governance, role creation, commission configuration, and security oversight.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ALL_PERMISSIONS.map((p) => p.code),
  },
  {
    code: 'support_admin',
    name: 'Customer Support Admin',
    description: 'Manages customer support tickets and views order statuses. Cannot approve payments, view KYC docs, or access secret codes.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['users:view', 'orders:view_all', 'support:view_all', 'support:reply', 'support:assign', 'support:resolve', 'refunds:view'],
  },
  {
    code: 'kyc_admin',
    name: 'Customer Verification / KYC Admin',
    description: 'Reviews customer KYC applications and inspects private identity documents. Cannot modify payment settings or approve orders.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['users:view', 'kyc:view', 'kyc:view_documents', 'kyc:review', 'kyc:approve', 'kyc:reject'],
  },
  {
    code: 'vendor_admin',
    name: 'Vendor Verification Admin',
    description: 'Reviews vendor onboarding applications, business registration documents, and reseller authorizations.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['vendors:view', 'vendors:review', 'vendors:approve', 'vendors:reject', 'vendors:suspend'],
  },
  {
    code: 'payment_admin',
    name: 'Payment Verification Admin',
    description: 'Reconciles customer manual payment submissions against bank/QR statements and approves or rejects payments.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['payments:view', 'payments:view_evidence', 'payments:approve', 'payments:reject', 'orders:view_all'],
  },
  {
    code: 'product_admin',
    name: 'Product Management Admin',
    description: 'Reviews vendor product submissions, verifies reseller authorization, and manages categories.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['products:view_all', 'products:create', 'products:edit', 'products:approve', 'products:reject', 'products:suspend', 'vendors:view'],
  },
  {
    code: 'fulfillment_admin',
    name: 'Order and Fulfillment Admin',
    description: 'Executes manual order deliveries for verified paid orders and records delivery evidence.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['orders:view_all', 'orders:manage_status', 'fulfillment:view', 'fulfillment:execute', 'fulfillment:view_secrets', 'inventory:view', 'inventory:manage'],
  },
  {
    code: 'promotions_admin',
    name: 'Promotions Admin',
    description: 'Creates and manages promotional campaigns, discount rules, and eligibility limits.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['promotions:view', 'promotions:create', 'promotions:edit'],
  },
  {
    code: 'finance_admin',
    name: 'Finance and Settlement Admin',
    description: 'Manages financial ledger, vendor settlement payouts, and refund reversals. Has no access to customer KYC identity documents.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['finance:view_ledger', 'settlements:view', 'settlements:approve', 'settlements:pay', 'settlements:reject', 'refunds:view', 'refunds:review', 'refunds:approve', 'refunds:reject', 'payments:view'],
  },
  {
    code: 'reports_admin',
    name: 'Reports Admin',
    description: 'Generates and exports financial, reconciliation, vendor, and operational analytics.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['reports:view', 'reports:export', 'finance:view_ledger', 'orders:view_all'],
  },
  {
    code: 'content_admin',
    name: 'Content Management Admin',
    description: 'Manages legal content pages, FAQs, promotional banners, and notification templates.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['content:view', 'content:edit', 'settings:manage_branding'],
  },
  {
    code: 'security_admin',
    name: 'Security and Audit Admin',
    description: 'Audits administrative actions, login failures, document access events, and security logs.',
    isSystemRole: true,
    isAdminRole: true,
    permissions: ['audit:view', 'audit:export', 'users:view', 'users:suspend', 'admins:view', 'roles:view'],
  },
  {
    code: 'vendor',
    name: 'Vendor',
    description: 'Approved marketplace merchant able to submit products, fulfill assigned vendor orders, and request settlements.',
    isSystemRole: true,
    isAdminRole: false,
    permissions: ['products:create', 'products:edit', 'inventory:view', 'inventory:manage'],
  },
  {
    code: 'customer',
    name: 'Customer',
    description: 'Registered marketplace buyer able to purchase digital products, submit manual payment proof, and receive deliveries.',
    isSystemRole: true,
    isAdminRole: false,
    permissions: [],
  },
];

export function resolvePermissionsForRoles(
  roleCodes: string[],
  customRoles: RoleDefinition[] = INITIAL_ROLES
): Set<PermissionCode> {
  const perms = new Set<PermissionCode>();
  for (const code of roleCodes) {
    const role = customRoles.find((r) => r.code === code) || INITIAL_ROLES.find((r) => r.code === code);
    if (role) {
      for (const p of role.permissions) {
        perms.add(p);
      }
    }
  }
  return perms;
}

export function hasPermission(
  roleCodes: string[],
  requiredPermission: PermissionCode,
  customRoles: RoleDefinition[] = INITIAL_ROLES
): boolean {
  if (roleCodes.includes('super_admin')) {
    return true;
  }
  const perms = resolvePermissionsForRoles(roleCodes, customRoles);
  return perms.has(requiredPermission);
}

export function canModifyRoleAssignment(
  actorRoles: string[],
  targetCurrentRoles: string[],
  targetNewRoles: string[],
  remainingSuperAdminCount: number
): { allowed: boolean; reason?: string } {
  if (!actorRoles.includes('super_admin')) {
    return {
      allowed: false,
      reason: 'Only a Super Admin can modify administrative roles or permissions.',
    };
  }
  const wasSuperAdmin = targetCurrentRoles.includes('super_admin');
  const willBeSuperAdmin = targetNewRoles.includes('super_admin');
  if (wasSuperAdmin && !willBeSuperAdmin && remainingSuperAdminCount <= 1) {
    return {
      allowed: false,
      reason: 'Cannot remove Super Admin role from the last remaining Super Admin account (lockout protection).',
    };
  }
  return { allowed: true };
}
