// server/lib/email.js
//
// Thin wrapper for all account-security emails: login OTP codes,
// admin-triggered "set your password" invites, and self-service "forgot
// password" links. Kept in one place so the sender identity, error
// handling, and templates stay consistent regardless of which provider
// is actually doing the sending.
//
// Two providers are supported, switched with one env var:
//
//   EMAIL_PROVIDER = "resend" (default) | "gmail"
//
// ── Resend ───────────────────────────────────────────────────────────────
//   RESEND_API_KEY    - Resend API key (dashboard -> API Keys)
//   RESEND_FROM_EMAIL - verified sender, e.g. "DENR RHRMPSB <no-reply@yourdomain.com>"
//                        Falls back to the resend.dev sandbox sender, which
//                        can only deliver to the email address that owns
//                        the Resend account until a domain is verified.
//
// ── Gmail (App Password) ────────────────────────────────────────────────
//   GMAIL_USER         - the sending Gmail address, e.g. "yourteam@gmail.com"
//   GMAIL_APP_PASSWORD - a 16-character App Password (NOT the account
//                         password). Requires 2-Step Verification to be
//                         enabled on the Google account; generate one at
//                         https://myaccount.google.com/apppasswords
//   No domain verification needed, and there's no "only send to yourself"
//   restriction — it sends as a normal Gmail message. Gmail does cap
//   sending at ~500/day on a regular account, so it suits small teams
//   during development better than high-volume production use.
//
//   FRONTEND_URL       - base URL of the deployed frontend, e.g.
//                         "https://xhrissun.github.io/rhrmpsb-system"
//                         (used by both providers)
//
// Whichever provider is selected, if its required env vars aren't set,
// these functions log a warning and no-op rather than crash the request
// path that triggered them (account changes should still save even if
// the notification email fails to send).

import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');

// ── Resend setup ─────────────────────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'DENR RHRMPSB <no-reply@resend.dev>';

// ── Gmail setup ──────────────────────────────────────────────────────────
const gmailTransport = (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  : null;
const GMAIL_FROM = `DENR RHRMPSB <${process.env.GMAIL_USER}>`;

const wrap = (bodyHtml) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: linear-gradient(135deg,#0f172a,#166534); padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <span style="color:#fff; font-size:16px; font-weight:700;">DENR CALABARZON RHRMPSB System</span>
    </div>
    <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      ${bodyHtml}
      <p style="font-size:12px; color:#94a3b8; margin-top: 28px;">
        If you did not expect this email, you can safely ignore it — no changes will be made to your account.
      </p>
    </div>
  </div>
`;

async function send({ to, subject, html }) {
  if (PROVIDER === 'gmail') return sendViaGmail({ to, subject, html });
  return sendViaResend({ to, subject, html });
}

async function sendViaResend({ to, subject, html }) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not configured — skipped sending "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const result = await resend.emails.send({ from: RESEND_FROM, to, subject, html });
    return result;
  } catch (error) {
    console.error('[email] Resend send failed:', error);
    throw new Error('Failed to send email notification');
  }
}

async function sendViaGmail({ to, subject, html }) {
  if (!gmailTransport) {
    console.warn(`[email] GMAIL_USER/GMAIL_APP_PASSWORD not configured — skipped sending "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const result = await gmailTransport.sendMail({ from: GMAIL_FROM, to, subject, html });
    return result;
  } catch (error) {
    console.error('[email] Gmail send failed:', error);
    throw new Error('Failed to send email notification');
  }
}

// ── Login OTP (two-factor authentication) ───────────────────────────────────
export async function sendOtpEmail(to, name, code, expiryMinutes) {
  const html = wrap(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your one-time verification code is:</p>
    <p style="font-size:32px; font-weight:800; letter-spacing:8px; text-align:center; margin: 20px 0; color:#166534;">${code}</p>
    <p>This code expires in <strong>${expiryMinutes} minutes</strong>. Do not share this code with anyone — RHRMPSB staff will never ask you for it.</p>
  `);
  return send({ to, subject: 'Your RHRMPSB sign-in verification code', html });
}

// ── Admin-triggered "set your password" invite ──────────────────────────────
export async function sendPasswordSetupEmail(to, name, token, userId, expiryHours) {
  const link = `${FRONTEND_URL}/set-password?uid=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
  const html = wrap(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>An administrator has set up your account on the DENR CALABARZON RHRMPSB System with this email address. To finish setting up your account, please create a password using the link below:</p>
    <p style="text-align:center; margin: 24px 0;">
      <a href="${link}" style="background:#166534; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:700;">Set Your Password</a>
    </p>
    <p>This link expires in <strong>${expiryHours} hours</strong>. Until you set your password, you will not be able to sign in.</p>
    <p style="font-size:12px; color:#94a3b8; word-break:break-all;">Or paste this link into your browser: ${link}</p>
  `);
  return send({ to, subject: 'Set up your RHRMPSB account password', html });
}

// ── Self-service "forgot password" ───────────────────────────────────────────
export async function sendPasswordResetEmail(to, name, token, userId, expiryMinutes) {
  const link = `${FRONTEND_URL}/set-password?uid=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}&mode=reset`;
  const html = wrap(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset your RHRMPSB account password. Click below to choose a new one:</p>
    <p style="text-align:center; margin: 24px 0;">
      <a href="${link}" style="background:#1d4ed8; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:700;">Reset Your Password</a>
    </p>
    <p>This link expires in <strong>${expiryMinutes} minutes</strong>. If you didn't request this, you can ignore this email — your password will not change.</p>
    <p style="font-size:12px; color:#94a3b8; word-break:break-all;">Or paste this link into your browser: ${link}</p>
  `);
  return send({ to, subject: 'Reset your RHRMPSB account password', html });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}