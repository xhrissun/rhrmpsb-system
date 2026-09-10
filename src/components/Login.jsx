import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authAPI } from '../utils/api';

const OTP_RESEND_COOLDOWN_SEC = 60;

const Login = React.memo(({ onLogin }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');

  // ── Two-factor (email OTP) step ────────────────────────────────────────────
  const [stage, setStage] = useState('credentials'); // 'credentials' | 'otp'
  const [pendingToken, setPendingToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(OTP_RESEND_COOLDOWN_SEC);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleChange = useCallback((e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (!formData.email.trim()) { setError('Email is required.'); return; }
    if (!formData.password) { setError('Password is required.'); return; }

    setLoading(true);
    setError('');

    try {
      // Clear stale session state before login
      const keysToRemove = [
        'authToken', 'user',
        'rater_selectedAssignment', 'rater_selectedPosition',
        'rater_selectedItemNumber', 'rater_selectedCandidate',
        'secretariat_selectedAssignment', 'secretariat_selectedPosition',
        'secretariat_selectedItemNumber', 'secretariat_selectedCandidate',
        'admin_activeTab',
      ];
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      const response = await authAPI.login(formData);
      // Password verified — server has emailed a one-time code. Move to the
      // OTP step; no session exists yet (pendingToken cannot call any
      // authenticated endpoint on its own).
      setPendingToken(response.pendingToken);
      setMaskedEmail(response.maskedEmail || '');
      setStage('otp');
      startCooldown();
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.status === 429) {
        setError('Too many login attempts. Please wait 15 minutes and try again.');
      } else if (err.response?.status === 423) {
        setError(err.response.data?.message || 'Account temporarily locked. Please try again later.');
      } else {
        setError(err.response?.data?.message || 'Login failed. Please check your credentials and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) { setOtpError('Verification code is required.'); return; }
    setOtpLoading(true);
    setOtpError('');
    try {
      const response = await authAPI.verifyOtp(pendingToken, otp.trim());
      localStorage.setItem('authToken', response.token);
      onLogin(response);
    } catch (err) {
      console.error('OTP verification error:', err);
      if (err.response?.status === 429) {
        setOtpError(err.response.data?.message || 'Too many attempts. Please log in again.');
      } else {
        setOtpError(err.response?.data?.message || 'Incorrect verification code.');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    try {
      await authAPI.resendOtp(pendingToken);
      startCooldown();
    } catch (err) {
      setOtpError(err.response?.data?.message || 'Could not resend code. Please try again.');
    }
  };

  const handleBackToCredentials = () => {
    setStage('credentials');
    setOtp('');
    setOtpError('');
    setPendingToken('');
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 md:p-6 lg:p-8">
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:grid md:grid-cols-5">

        {/* Branding panel */}
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-900 text-white px-6 py-8 md:p-8 lg:p-10 flex flex-col items-center justify-center text-center gap-4">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-white/10 rounded-full ring-2 ring-amber-400/50 shadow-lg p-3">
            <picture>
              <source srcSet="https://raw.githubusercontent.com/xhrissun/rhrmpsb-system/main/denr-logo.png" type="image/png" />
              <img
                src="https://raw.githubusercontent.com/xhrissun/rhrmpsb-system/main/denr-logo.png"
                alt="DENR Logo"
                className="w-full h-full object-contain"
                sizes="(max-width: 768px) 64px, 80px"
                loading="lazy"
              />
            </picture>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-emerald-200/70">Republic of the Philippines</p>
            <h1 className="text-lg md:text-xl font-bold tracking-tight leading-snug">
              DENR CALABARZON Competency-Based Rating System
            </h1>
          </div>
          <div className="hidden md:block mt-4 pt-4 border-t border-white/10 space-y-1">
            <p className="text-xs text-emerald-100/70 leading-relaxed">
              Authorized DENR RHRMPSB personnel only.<br />Your session is protected end-to-end.
            </p>
            <p className="text-xs italic text-emerald-200/50">Makakalikasan</p>
          </div>
        </div>

        {/* Form panel */}
        <div className="md:col-span-3 px-6 py-8 md:p-8 lg:p-12 flex flex-col justify-center">
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              {stage === 'credentials' ? 'Sign In' : 'Enter verification code'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {stage === 'credentials'
                ? 'Enter your RHRMPSB account credentials.'
                : <>Sent to <span className="font-medium text-slate-700">{maskedEmail}</span></>}
            </p>
          </div>

          {stage === 'credentials' ? (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 transition-colors duration-200 ${focusedField === 'email' ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField('')}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 text-base"
                  placeholder="Enter your email"
                  aria-describedby={error ? 'error-message' : undefined}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors duration-200 ${focusedField === 'password' ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField('')}
                  className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 text-base"
                  placeholder="Enter your password"
                  aria-describedby={error ? 'error-message' : undefined}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors duration-200 p-2"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                id="error-message"
                className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-base"
              aria-label="Sign in"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Sign In</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </button>

            <p className="text-center text-sm text-slate-500">
              Forgot your password?{' '}
              <Link to="/forgot-password" className="text-emerald-700 hover:text-emerald-800 font-medium underline">
                Reset it here
              </Link>
            </p>
          </form>
          ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5" noValidate>
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <ShieldCheck className="h-6 w-6 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-900">
                We sent a 6-digit verification code to your email.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="otp" className="block text-sm font-medium text-slate-700">
                Verification Code
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                className="w-full text-center tracking-[0.5em] text-lg font-semibold pl-4 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                placeholder="000000"
                aria-describedby={otpError ? 'otp-error-message' : undefined}
              />
            </div>

            {otpError && (
              <div id="otp-error-message" className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm" role="alert" aria-live="polite">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={otpLoading || otp.length !== 6}
              className="w-full py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-base"
            >
              {otpLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2"></div>
                  <span>Verifying...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Verify & Sign In</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={handleBackToCredentials} className="text-slate-500 hover:text-slate-700 underline">
                Back
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="text-emerald-700 hover:text-emerald-800 disabled:text-slate-400 disabled:cursor-not-allowed underline"
              >
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </div>
          </form>
          )}

          {/* Mobile-only footer (branding panel's footer is hidden below md) */}
          <div className="md:hidden mt-6 pt-4 border-t border-slate-200 text-center space-y-1">
            <p className="text-xs text-slate-400">
              Authorized DENR RHRMPSB personnel only. Your session is protected end-to-end.
            </p>
            <p className="text-xs italic text-slate-400">Makakalikasan</p>
          </div>
        </div>
      </div>
    </div>
  );
});

export default Login;