import crypto from 'node:crypto';
import { createSignedPrivateDocumentToken, verifySignedPrivateDocumentToken } from './security.ts';
import { hasPermission, type PermissionCode, type RoleDefinition } from '../config/permissions.ts';

export type StorageBucketPurpose =
  | 'kyc_document'
  | 'payment_receipt'
  | 'fulfillment_evidence'
  | 'support_attachment'
  | 'vendor_document'
  | 'product_image';

const ALLOWED_MIME_TYPES: Record<StorageBucketPurpose, string[]> = {
  kyc_document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  payment_receipt: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  fulfillment_evidence: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  support_attachment: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  vendor_document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  product_image: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isObjectStorageConfigured(): boolean {
  return Boolean(
    process.env.OBJECT_STORAGE_ENDPOINT &&
      process.env.OBJECT_STORAGE_BUCKET &&
      process.env.OBJECT_STORAGE_ACCESS_KEY_ID &&
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
  );
}

/**
 * Validates file upload metadata, prevents path traversal, and generates a safe private storage key.
 */
export function prepareSafeStorageObject(params: {
  purpose: StorageBucketPurpose;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  ownerId: string;
}): {
  storageKey: string;
  sanitizedFilename: string;
  isPrivate: boolean;
  providerMode: 's3_configured' | 'metadata_only_unconfigured';
} {
  if (params.originalFilename.includes('..') || params.originalFilename.includes('/') || params.originalFilename.includes('\\')) {
    throw new Error('Path traversal sequences are prohibited in filenames.');
  }

  const allowedMimes = ALLOWED_MIME_TYPES[params.purpose] || [];
  if (!allowedMimes.includes(params.mimeType)) {
    throw new Error(`Unsupported MIME type "${params.mimeType}" for ${params.purpose}.`);
  }

  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0 || params.sizeBytes > MAX_SIZE_BYTES) {
    throw new Error(`File size must be between 1 byte and 5 MB.`);
  }

  const sanitizedFilename = params.originalFilename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);

  const randomId = crypto.randomBytes(12).toString('hex');
  const datePrefix = new Date().toISOString().slice(0, 10);
  const storageKey = `private/${params.purpose}/${datePrefix}/${params.ownerId}_${randomId}_${sanitizedFilename}`;

  return {
    storageKey,
    sanitizedFilename,
    isPrivate: params.purpose !== 'product_image',
    providerMode: isObjectStorageConfigured() ? 's3_configured' : 'metadata_only_unconfigured',
  };
}

/**
 * Enforces RBAC before issuing a short-lived signed download link for private KYC, payment, or fulfillment documents.
 */
export function authorizeAndCreateSignedDocumentUrl(params: {
  actorId: string;
  actorRoles: string[];
  resourceOwnerId: string;
  storageKey: string;
  purpose: 'kyc_review' | 'payment_review' | 'fulfillment_evidence';
  customRoles?: RoleDefinition[];
}): { allowed: boolean; signedUrl?: string; expiresAt?: number; reason?: string } {
  const isOwner = params.actorId === params.resourceOwnerId;

  const requiredPermMap: Record<typeof params.purpose, PermissionCode> = {
    kyc_review: 'kyc:view_documents',
    payment_review: 'payments:view_evidence',
    fulfillment_evidence: 'fulfillment:view',
  };

  const requiredPermission = requiredPermMap[params.purpose];
  const hasAdminPerm = hasPermission(params.actorRoles, requiredPermission, params.customRoles);

  if (!isOwner && !hasAdminPerm) {
    return {
      allowed: false,
      reason: `Forbidden: Actor lacks "${requiredPermission}" permission to access private ${params.purpose} document.`,
    };
  }

  const { token, expiresAt } = createSignedPrivateDocumentToken({
    storageKey: params.storageKey,
    actorId: params.actorId,
    purpose: params.purpose,
    expiresInSeconds: 300,
  });

  return {
    allowed: true,
    signedUrl: `/api/storage/private-view?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

export { verifySignedPrivateDocumentToken };
