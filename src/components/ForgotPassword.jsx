import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { authAPI } from '../utils/api';

const ForgotPassword = React.memo(() => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required.'); return; }
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      // Always show the same generic confirmation, whether or not the email
      // is registered — the server never reveals which accounts exist.
      setSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait 15 minutes and try again.');
      } else {
        setError('Something went wrong. Please try again shortly.');
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
            <h1 className="text-2xl font-bold text-white">Forgot Password</h1>
            <p className="text-sm text-slate-300">
              Enter your registered email and we'll send you a link to reset your password.
            </p>
          </div>

          {submitted ? (
            <div className="space-y-6">
              <div className="flex items-start space-x-2 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-100 text-sm">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>If an account exists for that email, a password reset link has been sent. Please check your inbox (and spam folder).</span>
              </div>
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
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
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