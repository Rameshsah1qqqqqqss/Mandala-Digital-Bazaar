# Operations, Security, MongoDB Atlas & Vercel Deployment Guide

## 1. MongoDB Atlas Setup Instructions

1. **Create an Atlas Project & Cluster**:
   - Sign in to [MongoDB Atlas](https://cloud.mongodb.com) and create a project named `mandala-digital-nepal-prod`.
   - Provision an `M10+` replica-set cluster (or `M0` for staging) in `ap-south-1` (Mumbai — lowest latency to Kathmandu, Nepal). Replica-set support is required for multi-document ACID transactions (`withMongoTransaction`).
2. **Create Least-Privilege Database User**:
   - Under **Database Access**, create a dedicated application user with `readWrite` permissions on the `mandala_digital` database only (never grant `atlasAdmin` to application runtime credentials).
3. **Configure Network Access**:
   - Under **Network Access**, restrict IP access to your Vercel static egress IPs or peering CIDR during production. Never leave `0.0.0.0/0` unrestricted in production without strong SCRAM-SHA-256 credentials and TLS.
4. **Configure `MONGODB_URI`**:
   - Copy the SRV connection string (`mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/mandala_digital?retryWrites=true&w=majority`).
   - Add `MONGODB_URI` to `.env.local` for local development and to **Vercel Project Settings -> Environment Variables** (Server-only).
5. **Backups & Point-in-Time Recovery**:
   - Enable Continuous Cloud Backups in MongoDB Atlas with a 30-day retention policy for `Orders`, `Payments`, `FinancialLedgerEntries`, and `AuditLogs`.

---

## 2. GitHub & Vercel Deployment Workflow

1. **Export & Push to GitHub**:
   - Verify `.gitignore` excludes `.env`, `.env.local`, `node_modules`, and `.playwright-cli`.
   - Commit the repository and push to a private GitHub repository.
2. **Import into Vercel**:
   - In the Vercel Dashboard, click **Add New Project** and import your GitHub repository.
   - Configure all server environment variables listed in `.env.example`.
3. **Post-Deployment Verification Checklist**:
   - Run `npm run bootstrap:admin` once against the production MongoDB Atlas URI to provision the primary Super Admin.
   - Verify that private KYC and payment receipt storage keys cannot be fetched without a valid short-lived HMAC token (`/api/storage/private-view`).
   - Place a test order in NPR, submit a manual payment reference, approve it as `Payment Verification Admin`, and verify the 3 double-entry records in `FinancialLedgerEntries`.

---

## 3. Future Nepal Payment Gateway Integration Guide

Manual payment verification is mandatory and active at launch. When integrating automated Nepal payment gateways (`lib/payment-gateway.ts`):

1. **eSewa ePay v2 (`esewa_epay`)**:
   - Configure `ESEWA_MERCHANT_CODE`, `ESEWA_SECRET_KEY`, and `ESEWA_VERIFY_URL`.
   - Verify HMAC-SHA256 signature on callback and perform a server-to-server status lookup before transitioning `Payment.status` to `Approved`.
2. **Khalti e-Payment Gateway KPG-2 (`khalti_kpg`)**:
   - Configure `KHALTI_LIVE_SECRET_KEY` and call the server-side `/epayment/lookup/` endpoint using `pidx` to confirm `status === "Completed"` and `total_amount === expectedAmountPaisa`.
3. **NCHL ConnectIPS (`connectips`) & Fonepay Dynamic QR (`fonepay_qr`)**:
   - Validate the signed webhook payload or X.509 certificate response server-side.
   - **Critical Rule**: Never mark an order paid solely because the customer's browser lands on a success redirect URL.

---

## 4. Known Limitations & Unconfigured External Services

- **Database Runtime Mode**: When `MONGODB_URI` is provided, `lib/mongodb.ts` connects to MongoDB Atlas using Mongoose with connection pooling. When `MONGODB_URI` is empty in the preview container, the server runs in `Mongoose Schema Sandbox Mode` with deterministic Nepal seed data so all 12 RBAC roles, checkout, manual payment verification, manual fulfillment, KYC, ledger, settlements, refunds, and audit logs can be tested immediately.
- **Object Storage & Email**: S3 binary uploads and SMTP/HTTP email delivery require `OBJECT_STORAGE_*` and `EMAIL_PROVIDER_API_KEY` environment variables. When unconfigured, the platform explicitly labels notifications as `in_app_only_email_unconfigured` and never fabricates external delivery confirmations.
