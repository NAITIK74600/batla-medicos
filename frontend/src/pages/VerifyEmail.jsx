import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function VerifyEmail() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/login', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✉️</div>
        <h1>Redirecting...</h1>
        <p style={{ color: 'var(--gray-500)', marginBottom: 24 }}>
          Email verification is now OTP-based. Please log in.
        </p>
        <Link to="/login" className="btn btn--primary btn--full">Go to Login</Link>
      </div>
    </main>
  );
}
