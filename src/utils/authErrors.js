// src/utils/authErrors.js
//
// One place that turns ANY failure from the pre-login auth calls (login,
// OTP, forgot password, set password) into a message that tells the person
// what actually happened and what to do next.
//
// Why this exists: axios reports "server never answered" (timeout, offline,
// blocked by an extension/VPN/DNS, CORS, Render cold start / 502) the same
// way — as an error with no `response`. The old screens fell back to
// "Please check your credentials" for all of those, so people whose
// passwords were fine were told their password was wrong, retried, and
// (on the real login path) walked themselves into an account lockout.

import { API_ORIGIN } from './api';

export const SLOW_NOTICE_AFTER_MS = 6000;
export const LOCK_MINUTES = 15;
export const MAX_ATTEMPTS_BEFORE_LOCK = 5;

// Can this device reach the backend at all? Uses the root /ping route with a
// no-cors request: we don't need to read the reply, only to know the request
// got through. (It also wakes a sleeping Render instance as a side effect.)
export async function probeServer(timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${API_ORIGIN}/ping`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const minutesFrom = (seconds) => Math.max(1, Math.ceil((Number(seconds) || 0) / 60));

const NOT_YOUR_PASSWORD = 'This is not a problem with your password.';

/**
 * @param {any} err    the axios error
 * @param {'login'|'otp'|'resendOtp'|'forgot'|'setPassword'} context
 * @returns {Promise<{ message: string, kind: string, retryAfterSeconds?: number }>}
 */
export async function describeAuthError(err, context = 'login') {
  // ── 1. No response at all: network / timeout / blocked ───────────────────
  if (!err?.response) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        kind: 'offline',
        message: `You appear to be offline. ${NOT_YOUR_PASSWORD} Reconnect to the internet and try again.`,
      };
    }
    const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
    const reachable = await probeServer();
    if (!reachable) {
      return {
        kind: 'unreachable',
        message:
          `Your device could not reach the server. ${NOT_YOUR_PASSWORD} ` +
          'Try: (1) check your internet connection, (2) switch between Wi-Fi and mobile data, ' +
          '(3) turn off any VPN, ad blocker or "private DNS", (4) try another browser or a private/incognito window.',
      };
    }
    return {
      kind: timedOut ? 'timeout' : 'blocked',
      message: timedOut
        ? `The server is online but took too long to answer (it may be waking up). ${NOT_YOUR_PASSWORD} Wait a minute, then try again.`
        : `The server is online, but your request didn't go through. ${NOT_YOUR_PASSWORD} ` +
          'A browser extension (ad/privacy blocker) or security software may be blocking it. ' +
          'Try a private/incognito window or another browser.',
    };
  }

  // ── 2. The server answered ───────────────────────────────────────────────
  const status = err.response.status;
  const data = err.response.data && typeof err.response.data === 'object' ? err.response.data : {};
  const serverMsg = typeof data.message === 'string' ? data.message : '';
  const code = data.code;

  if (status === 429) {
    const wait = minutesFrom(data.retryAfterSeconds || LOCK_MINUTES * 60);
    return {
      kind: 'rate_limited',
      retryAfterSeconds: data.retryAfterSeconds,
      message:
        code === 'RATE_LIMITED_GLOBAL'
          ? `The system is receiving too many requests from your network right now. Please wait about ${wait} minute(s) and try again. ${NOT_YOUR_PASSWORD}`
          : `Too many attempts from your connection. Please wait about ${wait} minute(s) before trying again. ` +
            'This limit is shared by everyone on the same internet connection, so it may not have been you. ' +
            'Do not keep retrying — each attempt restarts the wait.',
    };
  }

  if (status === 423) {
    return {
      kind: 'locked',
      retryAfterSeconds: data.retryAfterSeconds,
      message:
        (serverMsg || `This account is temporarily locked after repeated wrong passwords.`) +
        ' While locked, even the correct password is refused. Wait it out, or use "Forgot your password?" to reset it and unlock right away.',
    };
  }

  if (status === 403 && context === 'login') {
    return { kind: 'must_set_password', message: serverMsg || 'This account cannot sign in yet. Please contact your administrator.' };
  }

  if (status === 401) {
    if (context === 'login') {
      return {
        kind: 'invalid_credentials',
        message:
          'Incorrect email or password. Please check: Caps Lock is off, there is no extra space before or after ' +
          'your password, and you are using the email your administrator registered. ' +
          `Tip: tap the eye icon to see what you typed. After ${MAX_ATTEMPTS_BEFORE_LOCK} wrong attempts the account locks for ${LOCK_MINUTES} minutes.`,
      };
    }
    return { kind: 'unauthorized', message: serverMsg || 'That did not work. Please try again.' };
  }

  if (status === 502 || status === 503 || status === 504 || (status >= 500 && !serverMsg)) {
    if (serverMsg && code === 'EMAIL_FAILED') {
      return { kind: 'email_failed', message: serverMsg };
    }
    return {
      kind: 'server',
      message: `The server is temporarily unavailable or still waking up (this can take up to a minute). ${NOT_YOUR_PASSWORD} Please wait a moment and try again.`,
    };
  }

  if (status >= 500) {
    return { kind: 'server', message: serverMsg || 'Something went wrong on our side. Please try again in a moment.' };
  }

  return { kind: 'other', message: serverMsg || 'Something went wrong. Please try again.' };
}

// Warnings shown next to the password field BEFORE submitting.
export function passwordInputHints(password) {
  const hints = [];
  if (password && password !== password.trim()) {
    hints.push('Your password has a space at the start or end. Passwords are exact — remove it unless it is really part of your password.');
  }
  return hints;
}

// Count of consecutive "wrong password" answers in this browser tab. Kept in
// sessionStorage so a page refresh does not reset the warning. Deliberately
// client-side: telling the SERVER to report "attempts left" would let anyone
// probe which emails are registered.
const FAIL_KEY = 'login_wrong_password_count';
export const failedLoginCount = {
  get() { try { return Number(sessionStorage.getItem(FAIL_KEY)) || 0; } catch { return 0; } },
  bump() { try { const n = failedLoginCount.get() + 1; sessionStorage.setItem(FAIL_KEY, String(n)); return n; } catch { return 0; } },
  reset() { try { sessionStorage.removeItem(FAIL_KEY); } catch { /* ignore */ } },
};