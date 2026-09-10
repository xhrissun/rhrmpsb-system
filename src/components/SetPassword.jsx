import React, { useState, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../utils/api';

const PASSWORD_RULES = [
  { test: (pw) => pw.length >= 8, label: 'At least 8 characters' },
  { test: (pw) => /[a-z]/.test(pw), label: 'A lowercase letter' },
  { test: (pw) => /[A-Z]/.test(pw), label: 'An uppercase letter' },
  { test: (pw) => /[0-9]/.test(pw), label: 'A number' },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), label: 'A symbol' },
];

// Requires 3 of the 4 character-class rules (matches server policy: 8+ chars
// plus at least 3 of lower/upper/number/symbol).
const classesMet = (pw) => PASSWORD_RULES.slice(1).filter((r) => r.test(pw)).length;
const isStrongEnough = (pw) => pw.length >= 8 && classesMet(pw) >= 3;

const SetPassword = React.memo(() => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';
  const isResetMode = searchParams.get('mode') === 'reset';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const linkValid = Boolean(uid && token);

  const strongEnough = useMemo(() => isStrongEnough(password), [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!strongEnough) { setError('Please meet all password requirements below.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      await authAPI.setPassword(uid, token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait 15 minutes and try again.');
      } else {
        setError(err.response?.data?.message || 'This link is invalid or has expired. Please request a new one.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 opacity-30 sm:opacity-40">
        <div className="h-full w-full bg-gradient-to-r from-blue-500/10 to-green-500/10"></div>
      </div>

      <div className="relative w-full max-w-sm sm:max-w-md">
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">
              {isResetMode ? 'Reset Your Password' : 'Set Your Password'}
            </h1>
            <p className="text-sm text-slate-300">
              {isResetMode
                ? 'Choose a new password for your account.'
                : 'Welcome! Please create a password to finish setting up your account.'}
            </p>
          </div>

          {!linkValid ? (
            <div className="flex items-center space-x-2 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>This link is missing required information. Please use the link exactly as it appeared in your email, or request a new one.</span>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-100 text-sm">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span>Password set successfully. Redirecting you to sign in...</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" noValidate>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-200">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    className="w-full pl-10 pr-12 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  className="w-full pl-4 pr-4 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
              </div>

              <ul className="space-y-1 text-xs">
                {PASSWORD_RULES.map((rule, i) => {
                  const met = rule.test(password);
                  return (
                    <li key={i} className={`flex items-center gap-2 ${met ? 'text-green-300' : 'text-slate-400'}`}>
                      <CheckCircle2 className={`h-3.5 w-3.5 ${met ? 'opacity-100' : 'opacity-30'}`} />
                      {rule.label}
                    </li>
                  );
                })}
                <li className="text-slate-400 pl-5">(At least 3 of the last 4 are required)</li>
              </ul>

              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !strongEnough || password !== confirmPassword}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {loading ? 'Saving...' : 'Set Password'}
              </button>

              <Link to="/login" className="block text-center text-sm text-slate-300 hover:text-white underline">
                Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
});

export default SetPassword;