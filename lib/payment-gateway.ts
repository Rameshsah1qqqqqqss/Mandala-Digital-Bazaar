/**
 * Provider-Independent Payment Gateway Architecture (Future Nepal Gateways)
 *
 * Manual payment verification is mandatory and active at launch.
 * This interface defines the strict server-side verification, signed webhook,
 * and idempotency contracts for future integration with eSewa EPAY, Khalti KPG,
 * ConnectIPS, and Fonepay Dynamic QR.
 *
 * SECURITY RULE:
 * Never mark an order paid because a browser reaches a return/success URL.
 * Only verified server-to-server lookup or HMAC-signed provider webhooks may confirm payment.
 */

export type SupportedGatewayProviderCode = 'esewa_epay' | 'khalti_kpg' | 'connectips' | 'fonepay_qr';

export interface GatewayInitiationRequest {
  orderId: string;
  orderNumber: string;
  amountPaisa: number;
  currency: 'NPR';
  customerId: string;
  idempotencyKey: string;
  callbackUrl: string;
}

export interface GatewayInitiationResponse {
  provider: SupportedGatewayProviderCode;
  configured: boolean;
  redirectUrl?: string;
  providerTransactionId?: string;
  errorReason?: string;
}

export interface GatewayVerificationResult {
  verified: boolean;
  provider: SupportedGatewayProviderCode;
  providerReference: string;
  settledAmountPaisa: number;
  currency: 'NPR';
  rawStatus: string;
  verifiedAtIso: string;
  errorReason?: string;
}

export interface PaymentGatewayAdapter {
  providerCode: SupportedGatewayProviderCode;
  displayName: string;
  isConfigured(): boolean;
  initiatePayment(req: GatewayInitiationRequest): Promise<GatewayInitiationResponse>;
  verifyTransactionServerSide(providerReference: string, expectedAmountPaisa: number): Promise<GatewayVerificationResult>;
  verifySignedWebhook(rawBody: string, signatureHeader: string): boolean;
}

export const FUTURE_NEPAL_GATEWAY_STATUS: Array<{
  providerCode: SupportedGatewayProviderCode;
  displayName: string;
  configured: boolean;
  requiredEnvVars: string[];
  mode: 'manual_verification_active' | 'gateway_live';
}> = [
  {
    providerCode: 'esewa_epay',
    displayName: 'eSewa ePay v2 API (Nepal)',
    configured: Boolean(process.env.ESEWA_MERCHANT_CODE && process.env.ESEWA_SECRET_KEY),
    requiredEnvVars: ['ESEWA_MERCHANT_CODE', 'ESEWA_SECRET_KEY', 'ESEWA_VERIFY_URL'],
    mode: 'manual_verification_active',
  },
  {
    providerCode: 'khalti_kpg',
    displayName: 'Khalti e-Payment Gateway (KPG-2)',
    configured: Boolean(process.env.KHALTI_LIVE_SECRET_KEY),
    requiredEnvVars: ['KHALTI_LIVE_SECRET_KEY', 'KHALTI_LOOKUP_URL'],
    mode: 'manual_verification_active',
  },
  {
    providerCode: 'connectips',
    displayName: 'NCHL ConnectIPS Merchant Gateway',
    configured: Boolean(process.env.CONNECTIPS_MERCHANT_ID && process.env.CONNECTIPS_PFX_CERT_PATH),
    requiredEnvVars: ['CONNECTIPS_MERCHANT_ID', 'CONNECTIPS_APP_ID', 'CONNECTIPS_PFX_CERT_PATH'],
    mode: 'manual_verification_active',
  },
  {
    providerCode: 'fonepay_qr',
    displayName: 'Fonepay Dynamic Merchant QR',
    configured: Boolean(process.env.FONEPAY_MERCHANT_CODE && process.env.FONEPAY_HMAC_SECRET),
    requiredEnvVars: ['FONEPAY_MERCHANT_CODE', 'FONEPAY_HMAC_SECRET'],
    mode: 'manual_verification_active',
  },
];
