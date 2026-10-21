import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { marketplaceStore } from './services/marketplace-engine.ts';
import { verifySignedPrivateDocumentToken, encryptSecretDeliveryCode, maskSecretCode } from './lib/security.ts';
import { nprToPaisa } from './lib/money.ts';
import { PermissionCode } from './config/permissions.ts';
import { connectToMongoDB, isMongoUriConfigured } from './lib/mongodb.ts';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Active HTTP-only session store (token -> userId)
const activeSessions = new Map<
  string,
  {
    sessionId: string;
    userId: string;
    userAgent: string;
    ipAddress: string;
    createdAt: string;
    expiresAt: number;
  }
>();

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'mdb_session_token';

function getAuthenticatedUserId(req: Request): string {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token && activeSessions.has(token)) {
    const sess = activeSessions.get(token)!;
    if (Date.now() < sess.expiresAt) {
      return sess.userId;
    }
    activeSessions.delete(token);
  }
  const headerActor = req.header('x-actor-id');
  if (headerActor && marketplaceStore.users.some((u) => u.id === headerActor)) {
    return headerActor;
  }
  return 'usr_customer_aarav';
}

function issueSessionCookie(req: Request, res: Response, userId: string) {
  const token = crypto.randomBytes(24).toString('hex');
  activeSessions.set(token, {
    sessionId: `ses_${ token.slice(0, 10) }`,
    userId,
    userAgent: req.header('user-agent') || 'Browser',
    ipAddress: req.ip || '127.0.0.1',
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// ============================================================================
// API ROUTES (/api/*)
// ============================================================================

app.get('/api/bootstrap', async (req: Request, res: Response) => {
  if (isMongoUriConfigured()) {
    await connectToMongoDB().catch(() => null);
  }
  const actorId = getAuthenticatedUserId(req);
  const currentUserRaw =
    marketplaceStore.users.find((u) => u.id === actorId) || marketplaceStore.users[0];
  const { passwordHash: _omitted, ...currentUser } = currentUserRaw;

  const safeUsers = marketplaceStore.users.map(({ passwordHash: _p, ...u }) => u);

  // Filter private/restricted data based on actor role
  const isAdmin = currentUser.roles.some((r) => r !== 'customer' && r !== 'vendor');

  const visibleOrders = isAdmin
    ? marketplaceStore.orders
    : currentUser.roles.includes('vendor')
    ? marketplaceStore.orders.filter(
        (o) => o.vendorId === currentUser.vendorId || o.customerId === currentUser.id
      )
    : marketplaceStore.orders.filter((o) => o.customerId === currentUser.id);

  const visiblePayments = isAdmin
    ? marketplaceStore.payments
    : marketplaceStore.payments.filter((p) => p.customerId === currentUser.id);

  // Never include secretCodeEncrypted in ordinary API responses!
  const visibleFulfillments = marketplaceStore.fulfillments
    .filter(
      (f) =>
        isAdmin ||
        f.customerId === currentUser.id ||
        (currentUser.roles.includes('vendor') && f.vendorId === currentUser.vendorId)
    )
    .map(({ secretCodeEncrypted: _sec, ...safeFulfillment }) => ({
      ...safeFulfillment,
      hasProtectedSecret: Boolean(_sec),
    }));

  const visibleInventory = marketplaceStore.digitalInventory
    .filter(
      (inv) =>
        isAdmin || (currentUser.roles.includes('vendor') && inv.vendorId === currentUser.vendorId)
    )
    .map(({ secretCodeEncrypted: _sec, ...safeInv }) => safeInv);

  const visibleKyc = isAdmin
    ? marketplaceStore.kycApplications.map(
        ({ documentNumberEncrypted: _enc, ...safeKyc }) => safeKyc
      )
    : marketplaceStore.kycApplications
        .filter((k) => k.userId === currentUser.id)
        .map(({ documentNumberEncrypted: _enc, ...safeKyc }) => safeKyc);

  const visibleTickets = isAdmin
    ? marketplaceStore.supportTickets
    : marketplaceStore.supportTickets.filter((t) => t.requesterUserId === currentUser.id);

  const userSessions = Array.from(activeSessions.values()).filter(
    (s) => s.userId === currentUser.id
  );

  res.json({
    currentUser,
    accountsForRoleSwitcher: safeUsers,
    branding: marketplaceStore.branding,
    categories: marketplaceStore.categories,
    vendors: marketplaceStore.vendors,
    products: marketplaceStore.products.map(({ sourcingCostPaisa, ...p }) => ({
      ...p,
      sourcingCostPaisa:
        isAdmin || p.vendorId === currentUser.vendorId ? sourcingCostPaisa : undefined,
    })),
    paymentMethods: marketplaceStore.paymentMethods,
    orders: visibleOrders,
    payments: visiblePayments,
    fulfillments: visibleFulfillments,
    digitalInventory: visibleInventory,
    kycApplications: visibleKyc,
    promotions: marketplaceStore.promotions,
    refunds: isAdmin
      ? marketplaceStore.refunds
      : marketplaceStore.refunds.filter(
          (r) => r.customerId === currentUser.id || r.vendorId === currentUser.vendorId
        ),
    ledger: isAdmin
      ? marketplaceStore.ledger
      : marketplaceStore.ledger.filter((l) => l.vendorId === currentUser.vendorId),
    settlements: isAdmin
      ? marketplaceStore.settlements
      : marketplaceStore.settlements.filter((s) => s.vendorId === currentUser.vendorId),
    supportTickets: visibleTickets,
    notifications: marketplaceStore.notifications.filter(
      (n) => n.recipientUserId === currentUser.id
    ),
    loginHistory: marketplaceStore.loginHistory.filter((l) =>
      isAdmin ? true : l.userId === currentUser.id
    ),
    activeSessions: userSessions,
    roles: marketplaceStore.roles,
    auditLogs: isAdmin ? marketplaceStore.auditLogs : [],
    metrics: marketplaceStore.getDashboardMetrics(),
  });
});

// Switch active persona/account (sets HTTP-only session cookie)
app.post('/api/auth/switch-role', (req: Request, res: Response) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  const target = marketplaceStore.users.find((u) => u.id === userId);
  if (!target) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  issueSessionCookie(req, res, target.id);
  const { passwordHash: _p, ...safeUser } = target;
  res.json({ user: safeUser });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(req.body);
    const { user } = marketplaceStore.authenticateUser({
      email: body.email,
      passwordPlain: body.password,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    });
    issueSessionCookie(req, res, user.id);
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Authentication failed' });
  }
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        fullName: z.string().min(2),
        email: z.string().email(),
        mobileNumber: z.string().min(7),
        password: z.string().min(8),
        city: z.string().optional(),
        addressLine: z.string().optional(),
      })
      .parse(req.body);
    const user = marketplaceStore.registerCustomer({
      fullName: body.fullName,
      email: body.email,
      mobileNumber: body.mobileNumber,
      passwordPlain: body.password,
      city: body.city,
      addressLine: body.addressLine,
    });
    issueSessionCookie(req, res, user.id);
    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

// Toggle saved product for customer
app.post('/api/customer/toggle-saved', (req: Request, res: Response) => {
  const actorId = getAuthenticatedUserId(req);
  const { productId } = z.object({ productId: z.string().min(1) }).parse(req.body);
  const user = marketplaceStore.users.find((u) => u.id === actorId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.savedProductIds.includes(productId)) {
    user.savedProductIds = user.savedProductIds.filter((id) => id !== productId);
  } else {
    user.savedProductIds.push(productId);
  }
  res.json({ savedProductIds: user.savedProductIds });
});

// Create Order (Checkout)
app.post('/api/orders', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        productId: z.string().min(1),
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        paymentMethodCode: z.string().min(1),
        customerDeliveryInputs: z.record(z.string(), z.string()),
        identifierConfirmedByCustomer: z.boolean(),
        promoCode: z.string().optional(),
      })
      .parse(req.body);

    const result = marketplaceStore.createOrder({
      customerId: actorId,
      ...body,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Order creation failed' });
  }
});

// Submit Manual Payment Reference & Proof
app.post('/api/payments/submit-proof', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        orderId: z.string().min(1),
        transactionReference: z.string().min(5),
        senderPhoneOrAccount: z.string().min(4),
        customerRemarks: z.string().optional(),
        receiptFilename: z.string().optional(),
      })
      .parse(req.body);

    const payment = marketplaceStore.submitManualPaymentProof({
      customerId: actorId,
      ...body,
    });
    res.json({ payment });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Payment submission failed' });
  }
});

// Payment Admin Review (Approve / Reject)
app.post('/api/admin/payments/review', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        paymentId: z.string().min(1),
        decision: z.enum(['Approved', 'Rejected']),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const result = marketplaceStore.reviewManualPayment({
      actorId,
      ...body,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment review failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Execute Manual Fulfillment
app.post('/api/fulfillment/execute', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        orderId: z.string().min(1),
        deliveryReference: z.string().min(4),
        deliveryNotes: z.string().min(4),
        internalStaffNotes: z.string().optional(),
        secretCodePlain: z.string().optional(),
        inventoryItemId: z.string().optional(),
      })
      .parse(req.body);

    const result = marketplaceStore.executeManualFulfillment({
      actorId,
      ...body,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fulfillment failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Reveal Protected Secret Code (Customer or Authorized Fulfillment Admin)
app.post('/api/orders/reveal-secret', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.body);
    const result = marketplaceStore.revealProtectedOrderSecret({ actorId, orderId });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cannot reveal secret code';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Customer Confirm Order Receipt
app.post('/api/orders/confirm-receipt', (req: Request, res: Response) => {
  const actorId = getAuthenticatedUserId(req);
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.body);
  const order = marketplaceStore.orders.find((o) => o.id === orderId);
  if (!order || order.customerId !== actorId) {
    res.status(403).json({ error: 'Forbidden: Only the purchasing customer can confirm receipt.' });
    return;
  }
  if (order.orderStatus !== 'Delivered') {
    res.status(400).json({ error: 'Only Delivered orders can be marked Completed by customer.' });
    return;
  }
  order.orderStatus = 'Completed';
  order.timeline.push({
    status: 'Completed',
    note: 'Customer confirmed receipt of digital delivery.',
    actorName: order.customerName,
    timestamp: new Date().toISOString(),
  });
  res.json({ order });
});

// Submit Customer KYC Application
app.post('/api/kyc/submit', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        legalName: z.string().min(3),
        dateOfBirth: z.string().min(4),
        district: z.string().min(2),
        municipalityAddress: z.string().min(4),
        documentType: z.enum([
          'Nepali Citizenship Certificate',
          'National Identity Card (NID)',
          'Nepali Passport',
        ]),
        documentNumberPlain: z.string().min(4),
        frontFilename: z.string().min(3),
        backFilename: z.string().optional(),
      })
      .parse(req.body);

    const kyc = marketplaceStore.submitKycApplication({
      userId: actorId,
      ...body,
    });
    res.status(201).json({ kyc });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'KYC submission failed' });
  }
});

// Review Customer KYC (KYC Admin / Super Admin)
app.post('/api/admin/kyc/review', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        kycId: z.string().min(1),
        decision: z.enum(['Approved', 'Rejected', 'More Information Required']),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const kyc = marketplaceStore.reviewKycApplication({
      actorId,
      ...body,
    });
    res.json({ kyc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'KYC review failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Issue RBAC-checked Short-Lived Signed URL for Private KYC / Payment Receipt Documents
app.post('/api/storage/signed-url', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        resourceOwnerId: z.string().min(1),
        storageKey: z.string().min(1),
        purpose: z.enum(['kyc_review', 'payment_review', 'fulfillment_evidence']),
      })
      .parse(req.body);

    const result = marketplaceStore.getAuthorizedPrivateDocumentLink({
      actorId,
      ...body,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Access denied';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Verify Signed Private Document Token
app.get('/api/storage/private-view', (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  const verified = verifySignedPrivateDocumentToken(token);
  if (!verified.valid) {
    res.status(403).json({ error: verified.reason || 'Invalid or expired signed URL' });
    return;
  }
  res.json({
    verified: true,
    storageKey: verified.storageKey,
    authorizedActorId: verified.actorId,
    purpose: verified.purpose,
    securityNote:
      'Authorized via short-lived HMAC-SHA256 signed token. Access event recorded in AuditLogs.',
  });
});

// Vendor Application & Review
app.post('/api/vendors/apply', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        shopName: z.string().min(3),
        businessRegNumber: z.string().min(3),
        panVatNumber: z.string().min(5),
        contactEmail: z.string().email(),
        contactMobile: z.string().min(7),
        city: z.string().min(2),
        address: z.string().min(4),
        categories: z.array(z.string()).min(1),
        resellerAuthorizationStatement: z.string().min(10),
        bankName: z.string().min(3),
        accountName: z.string().min(3),
        accountNumber: z.string().min(5),
        branch: z.string().min(2),
      })
      .parse(req.body);

    const vendor = marketplaceStore.submitVendorApplication({
      applicantUserId: actorId,
      ...body,
    });
    res.status(201).json({ vendor });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Vendor application failed' });
  }
});

app.post('/api/admin/vendors/review', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        vendorId: z.string().min(1),
        decision: z.enum(['Approved', 'Rejected', 'Suspended']),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const vendor = marketplaceStore.reviewVendorApplication({
      actorId,
      ...body,
    });
    res.json({ vendor });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Vendor review failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Vendor Product Submission & Admin Approval
app.post('/api/vendors/products', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        vendorId: z.string().min(1),
        categoryId: z.string().min(1),
        subcategory: z.string().min(2),
        title: z.string().min(4),
        shortDescription: z.string().min(8),
        description: z.string().min(12),
        priceNPR: z.number().positive(),
        sourcingCostNPR: z.number().nonnegative().optional(),
        expectedFulfillmentMinutes: z.number().int().min(5),
        regionRestriction: z.string().min(2),
        productTerms: z.string().min(5),
        resellerAuthorizedConfirmed: z.boolean(),
        variantLabel: z.string().min(2),
        stockCount: z.number().int().min(1),
      })
      .parse(req.body);

    const product = marketplaceStore.submitVendorProduct({
      actorId,
      ...body,
    });
    res.status(201).json({ product });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Product submission failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

app.post('/api/admin/products/review', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        productId: z.string().min(1),
        decision: z.enum(['Approved', 'Rejected', 'Suspended']),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const product = marketplaceStore.reviewProductSubmission({
      actorId,
      ...body,
    });
    res.json({ product });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Product review failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Digital Code Inventory Addition
app.post('/api/inventory/add', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const actor = marketplaceStore.users.find((u) => u.id === actorId);
    if (!actor) throw new Error('Unauthorized');

    const body = z
      .object({
        productId: z.string().min(1),
        variantId: z.string().min(1),
        batchReference: z.string().min(3),
        secretCodePlain: z.string().min(5),
        activationNotes: z.string().optional(),
      })
      .parse(req.body);

    const product = marketplaceStore.products.find((p) => p.id === body.productId);
    if (!product) throw new Error('Product not found');

    if (actor.vendorId !== product.vendorId) {
      marketplaceStore.assertPermission(actorId, 'inventory:manage');
    }

    const variant = product.variants.find((v) => v.variantId === body.variantId) || product.variants[0];
    const item = {
      id: `inv_${crypto.randomBytes(5).toString('hex')}`,
      productId: product.id,
      productTitle: product.title,
      variantId: variant.variantId,
      variantLabel: variant.label,
      vendorId: product.vendorId,
      batchReference: body.batchReference,
      secretCodeEncrypted: encryptSecretDeliveryCode(body.secretCodePlain),
      secretCodeMasked: maskSecretCode(body.secretCodePlain),
      status: 'available' as const,
      reservedOrderId: null,
      expiresAt: '2027-12-31T23:59:59.000Z',
      activationNotes: body.activationNotes || 'Authorized distributor batch code',
      createdAt: new Date().toISOString(),
    };
    marketplaceStore.digitalInventory.unshift(item);
    res.status(201).json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add inventory code';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Refunds & Disputes
app.post('/api/refunds/request', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        orderId: z.string().min(1),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const refund = marketplaceStore.createRefundRequest({
      customerId: actorId,
      ...body,
    });
    res.status(201).json({ refund });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Refund request failed' });
  }
});

app.post('/api/admin/refunds/review', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        refundId: z.string().min(1),
        decision: z.enum(['Completed', 'Rejected']),
        reason: z.string().min(5),
        refundReference: z.string().optional(),
      })
      .parse(req.body);

    const refund = marketplaceStore.reviewRefundRequest({
      actorId,
      ...body,
    });
    res.json({ refund });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refund review failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Vendor Settlement Request & Admin Payout
app.post('/api/vendors/settlements/request', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        vendorId: z.string().min(1),
        amountNPR: z.number().positive(),
      })
      .parse(req.body);

    const settlement = marketplaceStore.requestVendorSettlement({
      actorId,
      ...body,
    });
    res.status(201).json({ settlement });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Settlement request failed' });
  }
});

app.post('/api/admin/settlements/process', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        settlementId: z.string().min(1),
        decision: z.enum(['Settlement Paid', 'Settlement Rejected']),
        payoutReference: z.string().min(1),
        reason: z.string().min(5),
      })
      .parse(req.body);

    const settlement = marketplaceStore.processVendorSettlement({
      actorId,
      ...body,
    });
    res.json({ settlement });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Settlement processing failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Promotions Management
app.post('/api/admin/promotions', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const actor = marketplaceStore.assertPermission(actorId, 'promotions:create');
    const body = z
      .object({
        code: z.string().min(3).max(24),
        discountType: z.enum(['percentage', 'fixed']),
        discountValue: z.number().positive(),
        minOrderNPR: z.number().nonnegative(),
        maxDiscountNPR: z.number().nonnegative(),
        firstOrderOnly: z.boolean(),
        totalUsageLimit: z.number().int().min(1),
        perCustomerLimit: z.number().int().min(1),
      })
      .parse(req.body);

    const cleanCode = body.code.trim().toUpperCase();
    if (marketplaceStore.promotions.some((p) => p.code === cleanCode)) {
      throw new Error(`Promo code "${cleanCode}" already exists.`);
    }

    const promo = {
      code: cleanCode,
      discountType: body.discountType,
      discountValue:
        body.discountType === 'fixed' ? nprToPaisa(body.discountValue) : body.discountValue,
      minOrderPaisa: nprToPaisa(body.minOrderNPR),
      maxDiscountPaisa: nprToPaisa(body.maxDiscountNPR),
      firstOrderOnly: body.firstOrderOnly,
      startsAt: new Date().toISOString(),
      expiresAt: '2027-12-31T23:59:59.000Z',
      totalUsageLimit: body.totalUsageLimit,
      currentUsageCount: 0,
      perCustomerLimit: body.perCustomerLimit,
      isActive: true,
    };

    marketplaceStore.promotions.unshift(promo);
    marketplaceStore.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'PROMOTION_CREATED',
      targetRecordType: 'Promotion',
      targetRecordId: promo.code,
      reason: `Created promotional campaign ${promo.code}`,
    });

    res.status(201).json({ promo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Promotion creation failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Support Tickets (Create & Reply)
app.post('/api/support/tickets', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const user = marketplaceStore.users.find((u) => u.id === actorId);
    if (!user) throw new Error('Unauthorized');

    const body = z
      .object({
        orderNumber: z.string().optional(),
        category: z.enum([
          'Payment Verification',
          'Order Delivery Delay',
          'Invalid Code / Top-Up Issue',
          'KYC Verification',
          'Vendor Inquiry',
          'General Support',
        ]),
        priority: z.enum(['low', 'medium', 'high', 'urgent']),
        subject: z.string().min(4),
        message: z.string().min(5),
      })
      .parse(req.body);

    const nowIso = new Date().toISOString();
    const ticket = {
      id: `tkt_${crypto.randomBytes(5).toString('hex')}`,
      ticketNumber: `TKT-NP-${1001 + marketplaceStore.supportTickets.length}`,
      requesterUserId: user.id,
      requesterName: user.fullName,
      requesterRole: user.roles[0] || 'customer',
      orderNumber: body.orderNumber || '',
      category: body.category,
      priority: body.priority,
      subject: body.subject,
      status: 'Open' as const,
      assignedAdminId: 'usr_support_admin',
      resolutionSummary: '',
      messages: [
        {
          messageId: `msg_${crypto.randomBytes(4).toString('hex')}`,
          senderUserId: user.id,
          senderName: user.fullName,
          senderRole: user.roles[0] || 'customer',
          body: body.message,
          isInternalNote: false,
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    marketplaceStore.supportTickets.unshift(ticket);
    res.status(201).json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Ticket creation failed' });
  }
});

app.post('/api/support/tickets/reply', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const user = marketplaceStore.users.find((u) => u.id === actorId);
    if (!user) throw new Error('Unauthorized');

    const body = z
      .object({
        ticketId: z.string().min(1),
        message: z.string().min(2),
        isInternalNote: z.boolean().optional(),
        nextStatus: z
          .enum(['Open', 'In Progress', 'Awaiting Customer', 'Escalated', 'Resolved'])
          .optional(),
      })
      .parse(req.body);

    const ticket = marketplaceStore.supportTickets.find((t) => t.id === body.ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const isOwner = ticket.requesterUserId === user.id;
    if (!isOwner) {
      marketplaceStore.assertPermission(actorId, 'support:reply');
    }

    const nowIso = new Date().toISOString();
    ticket.messages.push({
      messageId: `msg_${crypto.randomBytes(4).toString('hex')}`,
      senderUserId: user.id,
      senderName: user.fullName,
      senderRole: user.roles[0] || 'customer',
      body: body.message,
      isInternalNote: Boolean(body.isInternalNote && !isOwner),
      createdAt: nowIso,
    });

    if (body.nextStatus && !isOwner) {
      ticket.status = body.nextStatus;
    }
    ticket.updatedAt = nowIso;

    res.json({ ticket });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reply failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// RBAC Custom Role Creation & User Role Assignment
app.post('/api/admin/rbac/create-role', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        code: z.string().min(3),
        name: z.string().min(3),
        description: z.string().min(5),
        permissions: z.array(z.string()).min(1),
      })
      .parse(req.body);

    const role = marketplaceStore.createCustomRole({
      actorId,
      code: body.code,
      name: body.name,
      description: body.description,
      permissions: body.permissions as PermissionCode[],
    });
    res.status(201).json({ role });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Role creation failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

app.post('/api/admin/rbac/assign-roles', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const body = z
      .object({
        targetUserId: z.string().min(1),
        newRoles: z.array(z.string()).min(1),
        reason: z.string().min(4),
      })
      .parse(req.body);

    const user = marketplaceStore.assignUserRoles({
      actorId,
      ...body,
    });
    res.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Role assignment failed';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

// Update Payment Method Status & Site Settings
app.post('/api/admin/settings/payment-method', (req: Request, res: Response) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const actor = marketplaceStore.assertPermission(actorId, 'payment_methods:manage');
    const body = z
      .object({
        code: z.string().min(1),
        isEnabled: z.boolean(),
        instructions: z.string().optional(),
      })
      .parse(req.body);

    const pm = marketplaceStore.paymentMethods.find((m) => m.code === body.code);
    if (!pm) throw new Error('Payment method not found');
    pm.isEnabled = body.isEnabled;
    if (body.instructions) {
      pm.instructions = body.instructions;
    }

    marketplaceStore.recordAuditLog({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRoles: actor.roles,
      actionType: 'PAYMENT_METHOD_CONFIG_UPDATED',
      targetRecordType: 'PaymentMethod',
      targetRecordId: pm.code,
      reason: `Updated ${pm.displayName} enabled=${pm.isEnabled}`,
    });

    res.json({ paymentMethod: pm });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update payment method';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mandala Digital Bazaar server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
