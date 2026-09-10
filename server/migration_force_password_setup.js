// server/migration_force_password_setup.js
//
// OPTIONAL, NOT auto-run. Use this only if you want to roll every existing
// user over to the new "set your password via emailed link" flow in one
// batch, instead of triggering it per-user from the admin UI (the "Email
// Setup Link" option in Dashboard.jsx's password modal).
//
// What it does, per user:
//   1. Overwrites their password with a random, unusable value.
//   2. Sets mustSetPassword = true (blocks login until they complete setup).
//   3. Generates a single-use token and emails them a "set your password" link.
//
// Safe to re-run: users who already completed setup (mustSetPassword=false)
// are skipped unless --force is passed.
//
// IMPORTANT: make sure every affected user's email in the database has
// already been verified/replaced with their real address (per the rollout
// plan: admin corrects emails first, THEN sends setup links) — this script
// does not touch the email field at all, only password/reset-token state.
//
// Usage:
//   node server/migration_force_password_setup.js              # dry run (lists who would be emailed)
//   node server/migration_force_password_setup.js --apply      # actually sends emails
//   node server/migration_force_password_setup.js --apply --force   # also re-invite users who already set a password
//   node server/migration_force_password_setup.js --apply --only=email1@x.com,email2@x.com

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { User } from './models.js';
import { sendPasswordSetupEmail } from './lib/email.js';

dotenv.config();

const PASSWORD_SETUP_EXPIRY_HRS = 24;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const onlyEmails = onlyArg ? onlyArg.replace('--only=', '').split(',').map((e) => e.trim().toLowerCase()) : null;

  if (!process.env.MONGODB_URI) {
    console.error('FATAL: MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to MongoDB');

  const query = {};
  if (!force) query.mustSetPassword = { $ne: true };
  if (onlyEmails) query.email = { $in: onlyEmails };

  const users = await User.find(query).select('_id name email mustSetPassword');
  console.log(`Found ${users.length} user(s) to ${apply ? 'invite' : 'preview'}${onlyEmails ? ` (filtered to ${onlyEmails.length} email(s))` : ''}:`);
  users.forEach((u) => console.log(`  - ${u.name} <${u.email}>`));

  if (!apply) {
    console.log('\nDry run only — no emails sent, no passwords changed. Re-run with --apply to proceed.');
    await mongoose.disconnect();
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      await User.findByIdAndUpdate(user._id, {
        password: unusablePassword,
        mustSetPassword: true,
        passwordResetTokenHash: sha256(token),
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_SETUP_EXPIRY_HRS * 60 * 60 * 1000),
        failedLoginAttempts: 0,
        lockUntil: null,
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0
      });
      await sendPasswordSetupEmail(user.email, user.name, token, user._id.toString(), PASSWORD_SETUP_EXPIRY_HRS);
      console.log(`  ✓ sent to ${user.email}`);
      sent++;
    } catch (err) {
      console.error(`  ✗ failed for ${user.email}:`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});