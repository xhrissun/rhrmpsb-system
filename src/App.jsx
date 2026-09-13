import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import SetPassword from './components/SetPassword';
import Dashboard from './components/Dashboard';
import IdleTimeoutMonitor from './components/IdleTimeoutMonitor';
import { authAPI, usersAPI } from './utils/api';
import { ToastProvider } from './utils/ToastContext';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // FIX: Use consistent key 'authToken' (matches api.js interceptor and Login.jsx)
      const token = localStorage.getItem('authToken');
      const savedUser = localStorage.getItem('user');

      if (token && savedUser) {
        try {
          const userData = await authAPI.getCurrentUser();
          setUser(userData);
        } catch (error) {
          console.error('Auth verification failed:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();

    // ── Cross-tab session sync ──────────────────────────────────────────
    // localStorage is shared across every tab on this origin, but nothing
    // in this app was listening for changes made by OTHER tabs. Without
    // this, a tab already sitting on /login before a login happened in a
    // different tab of the same browser would never find out — it just
    // keeps showing the login form indefinitely, even though the person
    // is now authenticated. The 'storage' event fires in every OTHER tab
    // (never the one that made the change) whenever localStorage changes,
    // which is exactly the signal needed here.
    const handleStorageChange = (event) => {
      if (event.key !== 'authToken' && event.key !== 'user') return;
      if (event.newValue) {
        // Logged in (or token refreshed) in another tab — pick it up here.
        try {
          const savedUser = localStorage.getItem('user');
          if (savedUser) setUser(JSON.parse(savedUser));
        } catch {
          // Malformed cache — fall through and let initAuth's own
          // validation path handle it on next mount/refresh.
        }
      } else {
        // Logged out in another tab — mirror that here immediately rather
        // than leaving this tab authenticated against a token that no
        // longer exists.
        setUser(null);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData.user);
    // FIX: Use consistent key 'authToken' (matches api.js interceptor)
    localStorage.setItem('authToken', userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
  };

  // Lightweight presence ping — see POST /users/heartbeat and GET
  // /users/online in routes.js. Runs once immediately on login (so a
  // freshly-logged-in user shows up right away rather than waiting a full
  // interval) and then every 60s for as long as a tab stays authenticated,
  // independent of the idle-timeout tracking above — this reflects "has
  // an open, logged-in tab", not literally "actively typing this second".
  useEffect(() => {
    if (!user) return undefined;
    usersAPI.heartbeat();
    const interval = setInterval(() => usersAPI.heartbeat(), 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    setUser(null);
    // FIX: Use consistent key 'authToken' (matches api.js interceptor)
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Use basename for GitHub Pages deployment if needed
  const basename = import.meta.env.PROD ? '/rhrmpsb-system' : '/';

  return (
    <ToastProvider>
      <Router basename={basename}>
        <div className="App">
          {user && <IdleTimeoutMonitor onLogout={handleLogout} />}
          <Routes>
            <Route 
              path="/login" 
              element={
                user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
              } 
            />
            {/* Public — no auth required. Reachable even when logged in (e.g. a
                logged-in admin opening a colleague's invite link in a new tab). */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route 
              path="/" 
              element={
                user ? (
                  <Dashboard user={user} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ToastProvider>
  );
}

export default App;