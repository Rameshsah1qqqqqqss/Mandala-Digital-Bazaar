# Mandala Digital Bazaar — Nepal Multi-Vendor Digital Store & Marketplace

A production-oriented Multi-Vendor Digital Store and Marketplace engineered for **Nepal** (`NPR / Rs.`, `Asia/Kathmandu` NPT timezone) using **TypeScript**, **MongoDB Atlas + Mongoose ODM**, **React**, and **Express / Serverless API Route Handlers** compatible with **GitHub** and **Vercel**.

---

## 1. Implemented Architecture & Modules

- **Centralized Branding & Nepal Localization (`config/branding.ts`)**: Configurable marketplace identity, NPR (`Rs.`) currency formatting, `Asia/Kathmandu` timestamps, promotional banner settings, and 9 legal/operational content pages.
- **Granular 12-Role Server-Enforced RBAC (`config/permissions.ts`)**:
  1. `super_admin` — Full platform governance, custom role creation, commission & security configuration.
  2. `support_admin` — Customer support ticket assignment & replies (no access to payment approvals, KYC documents, or secret codes).
  3. `kyc_admin` — Customer KYC queue & short-lived signed identity document inspection.
  4. `vendor_admin` — Vendor application verification, approval, rejection, and suspension.
  5. `payment_admin` — Manual payment verification against bank/QR/wallet statements.
  6. `product_admin` — Vendor product submission review & reseller authorization verification.
  7. `fulfillment_admin` — Manual order fulfillment & encrypted code vault allocation.
  8. `promotions_admin` — Server-validated promotional discount campaigns.
  9. `finance_admin` — Auditable financial ledger, vendor settlement payouts, and refund reversals (no access to KYC identity documents).
  10. `reports_admin` — Financial and operational analytics & exports.
  11. `content_admin` — Legal pages, FAQs, and notification templates.
  12. `security_admin` — Immutable administrative audit logs & login security history.
- **Integer Minor-Unit (Paisa) Monetary Engine (`lib/money.ts`)**: All prices, discounts, marketplace commissions, and vendor net earnings are calculated in integer paisa (`1 NPR = 100 paisa`) on the server—eliminating IEEE-754 floating-point errors.
- **MongoDB Atlas & Mongoose Schemas (`models/index.ts`, `lib/mongodb.ts`)**: 33 domain schemas with explicit types, compound indexes, sparse unique normalized transaction reference indexes, immutable purchase-time order snapshots, and replica-set transaction support (`withMongoTransaction`).
- **AES-256-GCM Secret Delivery Vault & Signed Private Storage (`lib/security.ts`, `lib/storage.ts`)**: Gift card PINs and software license keys are encrypted at rest (`AES-256-GCM`), masked in tables/logs (`••••-••••-ABCD`), and decrypted only for the purchasing customer or authorized fulfillment staff with full `AuditLog` tracking. Private KYC and payment receipt files require RBAC-checked 5-minute HMAC-signed URLs.

---

## 2. Installation & Local Development Instructions

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and configure your variables
cp .env.example .env

# 3. Run automated unit & security integration tests
npm test

# 4. Start the full-stack development server on http://localhost:3000
npm run dev

# 5. Verify TypeScript compilation and production bundle build
npm run lint
npm run build
```

---

## 3. Environment Variables (`.env.example`)

| Variable | Purpose | Required For |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB Atlas replica-set connection string (`mongodb+srv://...`) | Live MongoDB Atlas persistence & transactions |
| `AUTH_SECRET` | Secret key for signing session tokens | Production authentication security |
| `ENCRYPTION_SECRET_KEY` | 32-byte key for AES-256-GCM encryption of secret codes & KYC numbers | Secret code vault & HMAC signed URLs |
| `APP_URL` | Base canonical URL (e.g., `https://mandaladigital.com.np`) | Callbacks & signed links |
| `EMAIL_PROVIDER_API_KEY` | Transactional email API key (Resend / Postmark) | Live outbound email notifications |
| `EMAIL_FROM` | Verified sender address (`noreply@mandaladigital.com.np`) | Outbound email notifications |
| `OBJECT_STORAGE_ENDPOINT` | S3-compatible private bucket endpoint (AWS S3 / Cloudflare R2) | Private binary object storage |
| `OBJECT_STORAGE_BUCKET` | Private bucket name for KYC & payment receipts | Private binary object storage |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | S3 access key ID | Private binary object storage |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | S3 secret access key | Private binary object storage |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial Super Admin email for one-time CLI bootstrap | `npm run bootstrap:admin` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial Super Admin password (min 12 chars) | `npm run bootstrap:admin` |

> **Security Rule**: Never place `MONGODB_URI`, `AUTH_SECRET`, `ENCRYPTION_SECRET_KEY`, or storage secrets in `NEXT_PUBLIC_*` or `VITE_*` client variables.

---

## 4. Secure Super Admin Bootstrap

To create the first Super Admin in MongoDB Atlas without hardcoding credentials or exposing a public registration endpoint:

```bash
BOOTSTRAP_ADMIN_EMAIL="superadmin@yourdomain.com.np" \
BOOTSTRAP_ADMIN_PASSWORD="StrongUniquePassword#2026" \
BOOTSTRAP_ADMIN_NAME="Primary Super Admin" \
npm run bootstrap:admin
```

- Hashes the password with `bcrypt` (cost factor 12).
- Checks if a `super_admin` already exists in MongoDB Atlas and aborts if one is present (preventing duplicate privileged accounts).
- Records `SUPER_ADMIN_ONE_TIME_BOOTSTRAP` in `AuditLogs`.

---

## 5. Automated Testing (`node --test`)

Run the test suite via:

```bash
node --test tests/marketplace.test.ts
```

Covers all 10 mandatory security scenarios:
1. Support Admin cannot approve payments without `payments:approve` permission.
2. Payment Admin cannot modify Super Admin permissions or escalate privileges; last Super Admin cannot be locked out.
3. Customers cannot view or reveal another customer's private order codes.
4. Vendors cannot submit products or fulfill orders belonging to another vendor.
5. Unpaid orders cannot be fulfilled before manual payment approval.
6. Normalized payment transaction references (`normalizePaymentReference`) block duplicate reuse across orders.
7. Repeated or concurrent requests cannot fulfill the same order twice.
8. Promotion redemptions cannot exceed configured usage limits.
9. Unauthorized users (including Finance and Support Admins) cannot issue signed URLs for private KYC documents.
10. Repeated payment approvals are blocked idempotently and never create duplicate financial ledger entries.

See [`documentation/OPERATIONS_AND_DEPLOYMENT.md`](documentation/OPERATIONS_AND_DEPLOYMENT.md) for the complete MongoDB Atlas setup, GitHub-to-Vercel deployment guide, backup/recovery procedures, and future Nepal payment gateway integration guide.
