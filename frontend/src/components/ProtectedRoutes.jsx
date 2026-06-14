import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner">Loading...</div>;
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
};

export const RequireAdmin = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner">Loading...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

export const RequireSuperAdmin = ({ children }) => {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner">Loading...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;
  return children;
};
