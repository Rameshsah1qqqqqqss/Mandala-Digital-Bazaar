import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketplaceStore } from '../services/marketplace-engine.ts';
import {
  nprToPaisa,
  paisaToNpr,
  formatNPR,
  calculateCheckoutTotals,
  calculateCommissionBreakdown,
  validateOrderStatusTransition,
  normalizePaymentReference,
} from '../lib/money.ts';
import {
  encryptSecretDeliveryCode,
  decryptSecretDeliveryCode,
  maskSecretCode,
} from '../lib/security.ts';

test('1. Integer Paisa Monetary Math & Commission Calculations', () => {
  assert.equal(nprToPaisa(1450), 145000);
  assert.equal(paisaToNpr(145000), 1450);
  assert.equal(formatNPR(145000), 'Rs. 1,450');

  const comm = calculateCommissionBreakdown(145000, 14500, 7);
  assert.equal(comm.netCollectedPaisa, 130500);
  assert.equal(comm.marketplaceCommissionPaisa, 9135); // 7% of 130,500 paisa
  assert.equal(comm.vendorNetEarningPaisa, 121365);
  assert.equal(
    comm.marketplaceCommissionPaisa + comm.vendorNetEarningPaisa,
    comm.netCollectedPaisa
  );
});

test('2. Security Scenario 1: Support Admin cannot approve payments without permission', () => {
  const store = new MarketplaceStore();
  assert.throws(
    () => {
      store.reviewManualPayment({
        actorId: 'usr_support_admin',
        paymentId: 'pay_1002',
        decision: 'Approved',
        reason: 'Attempted approval by Support Admin',
      });
    },
    /Forbidden: You lack the required "payments:approve" permission/
  );
});

test('3. Security Scenario 2: Payment Admin cannot modify Super Admin permissions or roles', () => {
  const store = new MarketplaceStore();
  assert.throws(
    () => {
      store.assignUserRoles({
        actorId: 'usr_payment_admin',
        targetUserId: 'usr_payment_admin',
        newRoles: ['super_admin'],
        reason: 'Self-privilege escalation attempt',
      });
    },
    /Forbidden: You lack the required "admins:manage_roles" permission/
  );

  // Also test last Super Admin lockout prevention
  assert.throws(
    () => {
      store.assignUserRoles({
        actorId: 'usr_super_admin',
        targetUserId: 'usr_super_admin',
        newRoles: ['support_admin'],
        reason: 'Accidentally removing last Super Admin',
      });
    },
    /Cannot remove Super Admin role from the last remaining Super Admin account/
  );
});

test('4. Security Scenario 3: Customers cannot submit payment or view secrets for another customer order', () => {
  const store = new MarketplaceStore();
  // ord_1001 belongs to usr_customer_aarav; usr_customer_sita tries to reveal its secret code
  assert.throws(
    () => {
      store.revealProtectedOrderSecret({
        actorId: 'usr_customer_sita',
        orderId: 'ord_1001',
      });
    },
    /Forbidden: Only the purchasing customer or authorized fulfillment admin may reveal this code/
  );

  // Intended customer CAN reveal their own code
  const revealed = store.revealProtectedOrderSecret({
    actorId: 'usr_customer_aarav',
    orderId: 'ord_1001',
  });
  assert.equal(revealed.plainSecretCode, 'CANVA-ACT-NP-8821-VERIFIED');
});

test('5. Security Scenario 4: Vendors cannot modify another vendor products or fulfill another vendor orders', () => {
  const store = new MarketplaceStore();
  // usr_vendor_himalayan (vnd_himalayan) attempts to submit a product under vnd_kantipur
  assert.throws(
    () => {
      store.submitVendorProduct({
        actorId: 'usr_vendor_himalayan',
        vendorId: 'vnd_kantipur',
        categoryId: 'cat_gaming',
        subcategory: 'PUBG Mobile UC',
        title: 'Unauthorized Cross-Vendor Listing',
        shortDescription: 'Test',
        description: 'Test',
        priceNPR: 500,
        expectedFulfillmentMinutes: 15,
        regionRestriction: 'Nepal',
        productTerms: 'Terms',
        resellerAuthorizedConfirmed: true,
        variantLabel: 'Pack',
        stockCount: 10,
      });
    },
    /Forbidden: Vendors cannot create or modify products for another vendor/
  );

  // usr_vendor_himalayan attempts to fulfill ord_1003 which belongs to vnd_kantipur
  assert.throws(
    () => {
      store.executeManualFulfillment({
        actorId: 'usr_vendor_himalayan',
        orderId: 'ord_1003',
        deliveryReference: 'FUL-HIJACK-99',
        deliveryNotes: 'Cross-vendor fulfillment attempt',
      });
    },
    /Forbidden: You are not authorized to fulfill this order/
  );
});

test('6. Security Scenario 5: Unpaid orders cannot be delivered through unauthorized or premature actions', () => {
  const store = new MarketplaceStore();
  // ord_1002 has paymentStatus = 'Payment Submitted' (not Approved yet)
  assert.throws(
    () => {
      store.executeManualFulfillment({
        actorId: 'usr_fulfillment_admin',
        orderId: 'ord_1002',
        deliveryReference: 'FUL-UNPAID-001',
        deliveryNotes: 'Attempting to deliver before payment approval',
      });
    },
    /Manual payment must be Approved first/
  );

  const transition = validateOrderStatusTransition('Pending Payment', 'Delivered', 'Unpaid');
  assert.equal(transition.valid, false);
});

test('7. Security Scenario 6: One payment reference cannot be improperly applied to multiple orders', () => {
  const store = new MarketplaceStore();
  const { order } = store.createOrder({
    customerId: 'usr_customer_sita',
    productId: 'prd_ncell_40gb',
    variantId: 'var_ncell_40gb',
    quantity: 1,
    paymentMethodCode: 'esewa_manual',
    customerDeliveryInputs: {
      telecomMobileNumber: '9808765432',
      operatorName: 'Ncell',
    },
    identifierConfirmedByCustomer: true,
  });

  // Attempt to reuse 'eSewa 771-9204' (which normalizes to ESEWA7719204, already used on pay_1003)
  assert.equal(normalizePaymentReference('eSewa 771-9204'), 'ESEWA7719204');
  assert.throws(
    () => {
      store.submitManualPaymentProof({
        customerId: 'usr_customer_sita',
        orderId: order.id,
        transactionReference: 'eSewa 771-9204',
        senderPhoneOrAccount: '9808765432',
      });
    },
    /Duplicate payment reference detected/
  );
});

test('8. Security Scenario 7 & 10: Repeated requests cannot fulfill an order twice or create duplicate financial ledger entries', () => {
  const store = new MarketplaceStore();
  const ledgerCountBefore = store.ledger.length;

  // Approve pay_1002 by Payment Verification Admin
  store.reviewManualPayment({
    actorId: 'usr_payment_admin',
    paymentId: 'pay_1002',
    decision: 'Approved',
    reason: 'Verified Rs. 1,305 Fonepay QR settlement in Global IME statement.',
  });

  const ledgerCountAfterFirstApproval = store.ledger.length;
  assert.equal(ledgerCountAfterFirstApproval, ledgerCountBefore + 3);

  // Attempting to approve pay_1002 a second time must throw and NOT create duplicate ledger entries
  assert.throws(
    () => {
      store.reviewManualPayment({
        actorId: 'usr_payment_admin',
        paymentId: 'pay_1002',
        decision: 'Approved',
        reason: 'Repeated click approval',
      });
    },
    /Duplicate approval and duplicate ledger creation prevented/
  );
  assert.equal(store.ledger.length, ledgerCountAfterFirstApproval);

  // Fulfill ord_1002 once
  store.executeManualFulfillment({
    actorId: 'usr_vendor_kantipur',
    orderId: 'ord_1002',
    deliveryReference: 'FUL-PUBG-660-OK',
    deliveryNotes: 'Credited 660 UC to UID 5182930412',
  });

  // Attempting to fulfill ord_1002 a second time must be rejected
  assert.throws(
    () => {
      store.executeManualFulfillment({
        actorId: 'usr_fulfillment_admin',
        orderId: 'ord_1002',
        deliveryReference: 'FUL-PUBG-660-DUP',
        deliveryNotes: 'Second fulfillment attempt',
      });
    },
    /already been fulfilled\. Duplicate delivery prevented/
  );
});

test('9. Security Scenario 8: Concurrent promotion redemption cannot exceed configured limits', () => {
  const promo = {
    code: 'LIMITED1',
    discountType: 'fixed' as const,
    discountValue: nprToPaisa(100),
    minOrderPaisa: nprToPaisa(500),
    maxDiscountPaisa: nprToPaisa(100),
    firstOrderOnly: false,
    startsAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-12-31T23:59:59.000Z',
    totalUsageLimit: 1,
    currentUsageCount: 1, // Already at limit
    perCustomerLimit: 1,
    isActive: true,
  };

  const result = calculateCheckoutTotals({
    unitPricePaisa: nprToPaisa(1000),
    quantity: 1,
    promo,
  });
  assert.equal(result.promoApplied, false);
  assert.match(result.promoRejectionReason || '', /total usage limit has been reached/);
});

test('10. Security Scenario 9: Unauthorized users (including Finance & Support Admins) cannot retrieve private KYC files', () => {
  const store = new MarketplaceStore();
  // Finance Admin does NOT have kyc:view_documents permission
  assert.throws(
    () => {
      store.getAuthorizedPrivateDocumentLink({
        actorId: 'usr_finance_admin',
        resourceOwnerId: 'usr_customer_aarav',
        storageKey: 'private/kyc_document/2026-10-18/usr_customer_aarav_citizenship_front.jpg',
        purpose: 'kyc_review',
      });
    },
    /Forbidden: Actor lacks "kyc:view_documents" permission/
  );

  // KYC Admin DOES have kyc:view_documents permission
  const link = store.getAuthorizedPrivateDocumentLink({
    actorId: 'usr_kyc_admin',
    resourceOwnerId: 'usr_customer_aarav',
    storageKey: 'private/kyc_document/2026-10-18/usr_customer_aarav_citizenship_front.jpg',
    purpose: 'kyc_review',
  });
  assert.ok(link.signedUrl.startsWith('/api/storage/private-view?token='));
});

test('11. Secret Code AES-256-GCM Encryption & Masking', () => {
  const raw = 'STEAM-NP-9942-ABCD';
  const encrypted = encryptSecretDeliveryCode(raw);
  assert.notEqual(encrypted, raw);
  assert.equal(decryptSecretDeliveryCode(encrypted), raw);
  assert.equal(maskSecretCode(raw), '••••-••••-ABCD');
});
