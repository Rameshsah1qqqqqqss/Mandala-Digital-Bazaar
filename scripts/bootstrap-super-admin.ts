/**
 * Secure Super Admin One-Time Bootstrap Script
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL="admin@yourdomain.com.np" \
 *   BOOTSTRAP_ADMIN_PASSWORD="YourStrongPassword#2026" \
 *   BOOTSTRAP_ADMIN_NAME="Primary Super Admin" \
 *   npm run bootstrap:admin
 *
 * Security Rules:
 * - Does not hardcode default production passwords.
 * - Requires explicit environment variables.
 * - Connects to MongoDB Atlas when MONGODB_URI is set and prevents duplicate privileged accounts.
 * - Hashes passwords with bcrypt (cost factor 12) and logs the bootstrap event to AuditLog.
 */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { connectToMongoDB, isMongoUriConfigured } from '../lib/mongodb.ts';
import { Models } from '../models/index.ts';

async function bootstrapSuperAdmin() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  const fullName = (process.env.BOOTSTRAP_ADMIN_NAME || 'Primary Super Admin').trim();

  if (!email || !email.includes('@')) {
    console.error('[BOOTSTRAP ERROR] BOOTSTRAP_ADMIN_EMAIL environment variable is required.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('[BOOTSTRAP ERROR] BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (isMongoUriConfigured()) {
    const conn = await connectToMongoDB();
    if (!conn) {
      console.error('[BOOTSTRAP ERROR] Failed to connect to MongoDB Atlas via MONGODB_URI.');
      process.exit(1);
    }

    const existingSuperAdmin = await Models.User.findOne({ roles: 'super_admin' }).lean();
    if (existingSuperAdmin) {
      console.error(
        '[BOOTSTRAP ABORTED] A Super Admin account already exists in MongoDB Atlas. Duplicate bootstrap prevented.'
      );
      process.exit(1);
    }

    const created = await Models.User.create({
      email,
      passwordHash,
      fullName,
      mobileNumber: '+977-9800000000',
      roles: ['super_admin'],
      emailVerified: true,
      mobileVerified: true,
      mfaEnabled: true,
      status: 'active',
      kycStatus: 'Approved',
    });

    await Models.AuditLog.create({
      eventId: `EVT-BOOTSTRAP-${Date.now()}`,
      actorId: String((created as { _id?: unknown })._id || 'bootstrap_script'),
      actorName: fullName,
      actorRoles: ['super_admin'],
      actionType: 'SUPER_ADMIN_ONE_TIME_BOOTSTRAP',
      targetRecordType: 'User',
      targetRecordId: email,
      reason: 'Executed one-time CLI Super Admin bootstrap script',
      correlationId: `boot_${crypto.randomBytes(6).toString('hex')}`,
    });

    console.log(`[BOOTSTRAP SUCCESS] Created Super Admin "${email}" in MongoDB Atlas and recorded AuditLog.`);
    process.exit(0);
  } else {
    console.log(
      `[BOOTSTRAP DRY-RUN] MONGODB_URI is not set. Verified credentials and bcrypt hash for "${email}". Set MONGODB_URI to persist to MongoDB Atlas.`
    );
  }
}

bootstrapSuperAdmin().catch((err) => {
  console.error('[BOOTSTRAP FATAL]', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
