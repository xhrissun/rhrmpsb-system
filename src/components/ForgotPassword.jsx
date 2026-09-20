import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft, Clock, Info } from 'lucide-react';
import { authAPI } from '../utils/api';
import { describeAuthError, SLOW_NOTICE_AFTER_MS } from '../utils/authErrors';

const RESEND_COOLDOWN_SEC = 60;
const EMAIL_LOOKS_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPassword = React.memo(() => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const slowTimerRef = useRef(null);
  const cooldownRef = useRef(null);

  useEffect(() => () => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SEC);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendRequest = async () => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned) { setError('Email is required.'); return; }
    if (!EMAIL_LOOKS_VALID.test(cleaned)) {
      setError('That does not look like a complete email address (for example name@denr.gov.ph). Please check for typos.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('You appear to be offline. Reconnect to the internet and try again.');
      return;
    }
    setLoading(true);
    setError('');
    setSlowNotice(false);
    slowTimerRef.current = setTimeout(() => setSlowNotice(true), SLOW_NOTICE_AFTER_MS);
    try {
      await authAPI.forgotPassword(cleaned);
      // Always show the same generic confirmation, whether or not the email
      // is registered — the server never reveals which accounts exist.
      setSubmitted(true);
      startCooldown();
    } catch (err) {
      const info = await describeAuthError(err, 'forgot');
      setError(info.message);
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setSlowNotice(false);
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendRequest(); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 opacity-30 sm:opacity-40">
        <div className="h-full w-full bg-gradient-to-r from-blue-500/10 to-green-500/10"></div>
      </div>

      <div className="relative w-full max-w-sm sm:max-w-md">
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">Forgot Password</h1>
            <p className="text-sm text-slate-300">
              Enter your registered email and we'll send you a link to reset your password.
            </p>
          </div>

          {submitted ? (
            <div className="space-y-6">
              <div className="flex items-start space-x-2 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-100 text-sm">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a password reset link is on its way.</span>
              </div>

              <div className="flex items-start space-x-2 p-4 bg-white/10 border border-white/20 rounded-xl text-slate-200 text-xs sm:text-sm leading-relaxed">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <ul className="list-disc pl-4 space-y-1">
                  <li>It can take a few minutes. Check <strong>Spam / Junk</strong> and <strong>Promotions</strong> too.</li>
                  <li>Nothing arrived? Make sure the address above is the one your administrator registered, with no typos.</li>
                  <li>The link works for <strong>60 minutes</strong> and only the <strong>newest</strong> email works. If you request again, ignore the older email.</li>
                  <li>Resetting your password also unlocks your account if it was locked from too many wrong attempts.</li>
                  <li>Still nothing after 10 minutes? Contact your administrator.</li>
                </ul>
              </div>

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={sendRequest}
                disabled={loading || cooldown > 0}
                className="w-full py-2.5 px-4 border border-white/30 text-white text-sm font-medium rounded-xl hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending...' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the link again'}
              </button>

              <button
                type="button"
                onClick={() => { setSubmitted(false); setError(''); }}
                className="block w-full text-center text-sm text-slate-300 hover:text-white underline"
              >
                Use a different email
              </button>
              <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-blue-300 hover:text-blue-200 underline">
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" noValidate>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-slate-200">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                    placeholder="Enter your email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {loading && slowNotice && (
                <div className="flex items-start space-x-2 p-3 bg-sky-500/20 border border-sky-400/30 rounded-xl text-sky-100 text-sm" role="status" aria-live="polite">
                  <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>Still working. The server may be waking up, which can take up to a minute. Please keep this page open.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-white underline">
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
});

export default ForgotPassword;