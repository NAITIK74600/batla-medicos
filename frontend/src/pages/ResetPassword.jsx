import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ResetPassword() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/forgot-password', { replace: true }), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔐</div>
        <h1>Redirecting...</h1>
        <p style={{ color: 'var(--gray-500)', marginBottom: 24 }}>
          Password reset links are no longer used. Redirecting you to the OTP-based reset page...
        </p>
        <Link to="/forgot-password" className="btn btn--primary btn--full">Go Now →</Link>
      </div>
    </main>
  );
}
