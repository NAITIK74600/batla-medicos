import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logoutUser, refreshToken } from '../api/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await getMe();
      setUser(data.user);
    } catch (err) {
      if (err.response?.status === 401) {
        // Access token expired — try to silently refresh before giving up
        try {
          await refreshToken();
          const { data } = await getMe();
          setUser(data.user);
          return;
        } catch {
          // Refresh failed — genuinely not logged in
          // Only clear user if login didn't already set it concurrently
          setUser(prev => (prev ? prev : null));
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Listen for session-expired event fired by axios interceptor when both tokens are dead
  useEffect(() => {
    const handler = () => {
      setUser(null);
      if (window.location.pathname !== '/login') navigate('/login');
    };
    window.addEventListener('auth:session-expired', handler);
    return () => window.removeEventListener('auth:session-expired', handler);
  }, [navigate]);

  const logout = async () => {
    await logoutUser().catch(() => {});
    setUser(null);
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, isAdmin, isSuperAdmin, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
