import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../utils/api';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Clear persisted UI state before logging in a new user
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-40">
        <div className="h-full w-full bg-gradient-to-r from-blue-500/10 to-purple-500/10"></div>
      </div>

      {/* Login Card */}
      <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-md xl:max-w-lg">
        {/* Main Card */}
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-7 md:p-8 lg:p-8 xl:p-10 space-y-6 sm:space-y-7 md:space-y-8">
          {/* Header */}
          <div className="text-center space-y-2 sm:space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-16 lg:h-16 xl:w-20 xl:h-20 bg-white/20 rounded-2xl shadow-lg mb-3 sm:mb-4 p-2">
              <img
                src="https://raw.githubusercontent.com/xhrissun/rhrmpsb-system/main/denr-logo.png"
                alt="DENR Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-bold text-white">
              DENR CALABARZON RHRMPSB SYSTEM
            </h1>
            <p className="text-xs sm:text-sm md:text-base lg:text-base xl:text-lg text-slate-300">
              Sign in to your DENR RHRMPSB account
            </p>
          </div>

          {/* Form Container */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 md:space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base font-medium text-slate-200">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail
                    className={`h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5 lg:h-5 lg:w-5 xl:h-6 xl:w-6 transition-colors duration-200 ${
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
                  className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 md:py-3 lg:py-3 xl:py-4 bg-white/10 border border-white/20 rounded-xl text-white text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base font-medium text-slate-200">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock
                    className={`h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5 lg:h-5 lg:w-5 xl:h-6 xl:w-6 transition-colors duration-200 ${
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
                  className="w-full pl-9 sm:pl-10 pr-10 sm:pr-12 py-2 sm:py-3 md:py-3 lg:py-3 xl:py-4 bg-white/10 border border-white/20 rounded-xl text-white text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors duration-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5 lg:h-5 lg:w-5 xl:h-6 xl:w-6" />
                  ) : (
                    <Eye className="h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5 lg:h-5 lg:h-5 xl:h-6 xl:w-6" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center space-x-2 p-2 sm:p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200">
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 md:h-4 md:w-4 lg:h-4 lg:w-4 xl:h-5 xl:w-5 flex-shrink-0" />
                <span className="text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-2 sm:py-3 md:py-3 lg:py-3 xl:py-4 px-3 sm:px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-200 disabled:transform-none disabled:cursor-not-allowed overflow-hidden"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5 lg:w-5 lg:h-5 xl:w-6 xl:h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 sm:mr-2"></div>
                  <span className="text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base">Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base">Sign In</span>
                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4 xl:w-5 xl:h-5" />
                </div>
              )}
            </button>

            {/* Forgot Password */}
            <div className="text-center">
              <button
                type="button"
                className="text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base text-slate-300 hover:text-white transition-colors duration-200 underline-offset-4 hover:underline"
              >
                Forgot your password? Please ask the Administrator for assistance
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="text-center text-xs sm:text-sm md:text-sm lg:text-sm xl:text-base text-slate-400">
            <p>Secure • Reliable • Professional</p>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -top-3 -left-3 w-20 h-20 sm:w-24 sm:h-24 md:w-24 md:h-24 lg:w-24 lg:h-24 xl:w-28 xl:h-28 bg-blue-500/20 rounded-full blur-xl"></div>
        <div className="absolute -bottom-3 -right-3 w-24 h-24 sm:w-32 sm:h-32 md:w-32 md:h-32 lg:w-32 lg:h-32 xl:w-36 xl:h-36 bg-purple-500/20 rounded-full blur-xl"></div>
      </div>
    </div>
  );
};

export default Login;