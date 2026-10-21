import crypto from 'node:crypto';

const DEFAULT_DEV_KEY = crypto
  .createHash('sha256')
  .update(process.env.ENCRYPTION_SECRET_KEY || 'mandala-digital-bazaar-nepal-dev-only-key-2026')
  .digest();

/**
 * Encrypts sensitive digital license keys / voucher PINs at rest using AES-256-GCM.
 */
export function encryptSecretDeliveryCode(plainSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', DEFAULT_DEV_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecretDeliveryCode(cipherPayload: string): string {
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret payload');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    DEFAULT_DEV_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Masks secret codes/PINs so full codes never appear in ordinary tables, logs, or emails.
 */
export function maskSecretCode(plainSecret: string): string {
  const cleaned = plainSecret.trim();
  if (cleaned.length <= 4) return '••••';
  const lastFour = cleaned.slice(-4);
  return `••••-••••-${lastFour}`;
}

/**
 * Masks sensitive identity document numbers in ordinary logs and tables.
 */
export function maskDocumentNumber(docNumber: string): string {
  const cleaned = docNumber.trim();
  if (cleaned.length <= 4) return '****';
  return `${cleaned.slice(0, 2)}****${cleaned.slice(-2)}`;
}

/**
 * Generates and verifies short-lived HMAC-signed URLs for private KYC and payment receipt documents.
 */
export function createSignedPrivateDocumentToken(params: {
  storageKey: string;
  actorId: string;
  purpose: 'kyc_review' | 'payment_review' | 'fulfillment_evidence';
  expiresInSeconds?: number;
}): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + (params.expiresInSeconds || 300) * 1000;
  const payload = `${params.storageKey}|${params.actorId}|${params.purpose}|${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', DEFAULT_DEV_KEY)
    .update(payload)
    .digest('hex');
  const token = Buffer.from(`${payload}|${signature}`, 'utf8').toString('base64url');
  return { token, expiresAt };
}

export function verifySignedPrivateDocumentToken(token: string): {
  valid: boolean;
  storageKey?: string;
  actorId?: string;
  purpose?: string;
  reason?: string;
} {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 5) {
      return { valid: false, reason: 'Malformed signed token' };
    }
    const [storageKey, actorId, purpose, expiresAtStr, signature] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, reason: 'Signed document URL has expired' };
    }
    const payload = `${storageKey}|${actorId}|${purpose}|${expiresAtStr}`;
    const expectedSig = crypto
      .createHmac('sha256', DEFAULT_DEV_KEY)
      .update(payload)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false, reason: 'Invalid token signature' };
    }
    return { valid: true, storageKey, actorId, purpose };
  } catch {
    return { valid: false, reason: 'Invalid token encoding' };
  }
}

/**
 * Prevents NoSQL operator injection ($gt, $ne, $where, etc.) in user-supplied filter values.
 */
export function sanitizeStringInput(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().slice(0, maxLength);
}

export function assertNoMongoOperators(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      throw new Error(`Disallowed query key detected: ${key}`);
    }
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      assertNoMongoOperators(val as Record<string, unknown>);
    }
  }
}
