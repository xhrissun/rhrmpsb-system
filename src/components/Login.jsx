import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../utils/api';

const Login = React.memo(({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');

  const handleChange = useCallback((e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const keysToRemove = [
        'rater_selectedAssignment',
        'rater_selectedPosition',
        'rater_selectedItemNumber',
        'rater_selectedCandidate',
        'secretariat_selectedAssignment',
        'secretariat_selectedPosition',
        'secretariat_selectedItemNumber',
        'secretariat_selectedCandidate',
        'admin_activeTab',
      ];

      keysToRemove.forEach((key) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      });

      const response = await authAPI.login(formData);
      localStorage.setItem('authToken', response.token);
      onLogin(response);
    } catch (error) {
      console.error('Login error:', error);
      setError(error.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 sm:p-6">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30 sm:opacity-40">
        <div className="h-full w-full bg-gradient-to-r from-blue-500/10 to-purple-500/10"></div>
      </div>

      {/* Login Card */}
      <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg">
        {/* Main Card */}
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-2xl shadow-lg mb-4 p-2">
              <picture>
                <source
                  srcSet="https://raw.githubusercontent.com/xhrissun/rhrmpsb-system/main/denr-logo.webp"
                  type="image/webp"
                />
                <img
                  src="https://raw.githubusercontent.com/xhrissun/rhrmpsb-system/main/denr-logo.png"
                  alt="DENR Logo"
                  className="w-full h-full object-contain"
                  sizes="(max-width: 640px) 48px, 64px"
                  loading="lazy"
                />
              </picture>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              DENR CALABARZON RHRMPSB SYSTEM
            </h1>
            <p className="text-sm sm:text-base text-slate-300">
              Sign in to your DENR RHRMPSB account
            </p>
          </div>

          {/* Form Container */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-200"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail
                    className={`h-5 w-5 transition-colors duration-200 ${
                      focusedField === 'email' ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  />
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
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="Enter your email"
                  aria-describedby={error ? 'email-error' : undefined}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-200"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock
                    className={`h-5 w-5 transition-colors duration-200 ${
                      focusedField === 'password' ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  />
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
                  className="w-full pl-10 pr-12 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="Enter your password"
                  aria-describedby={error ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors duration-200 p-2"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                id="error-message"
                className="flex items-center space-x-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-200 disabled:transform-none disabled:cursor-not-allowed overflow-hidden text-sm sm:text-base"
              aria-label="Sign in"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Sign In</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </button>

            {/* Forgot Password */}
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-slate-300 hover:text-white transition-colors duration-200 underline-offset-4 hover:underline"
                aria-label="Request password assistance"
              >
                Forgot your password? Please ask the Administrator for assistance
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="text-center text-xs sm:text-sm text-slate-400">
            <p>Secure • Reliable • Professional</p>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -top-4 -left-4 w-16 sm:w-24 h-16 sm:h-24 bg-blue-500/20 rounded-full blur-xl hidden sm:block"></div>
        <div className="absolute -bottom-4 -right-4 w-20 sm:w-32 h-20 sm:h-32 bg-purple-500/20 rounded-full blur-xl hidden sm:block"></div>
      </div>
    </div>
  );
});

export default Login;