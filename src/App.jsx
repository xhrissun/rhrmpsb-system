import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { authAPI } from './utils/api';

// Child component to handle authentication logic with useLocation
function AuthHandler({ setUser, setLoading }) {
  const location = useLocation();

  useEffect(() => {
    const initAuth = async () => {
      // Skip auth check if on login page
      if (location.pathname === '/login' || location.pathname === '/rhrmpsb-system/login') {
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');

      if (token && savedUser) {
        try {
          const userData = await authAPI.getCurrentUser();
          setUser(userData);
        } catch (error) {
          console.error('Auth verification failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [location, setUser, setLoading]);

  return null; // This component only handles side effects, no rendering
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleLogin = (userData) => {
    setUser(userData.user);
    localStorage.setItem('token', userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const basename = import.meta.env.PROD ? '/rhrmpsb-system' : '/';

  return (
    <Router basename={basename}>
      <AuthHandler setUser={setUser} setLoading={setLoading} />
      <div className="App">
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
          />
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
  );
}

export default App;