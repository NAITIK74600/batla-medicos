import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { loginUser, resendEmailOtp } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password required'),
});

export default function Login() {
  const { setUser, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formLoading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resending, setResending] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const from = location.state?.from?.pathname || '/';

  // Already logged in — bounce to destination
  if (!authLoading && user) return <Navigate to={from} replace />;

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await loginUser(data);
      setUser(res.data.user);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (err) {
      if (err.response?.data?.requiresVerification) {
        setUnverifiedEmail(err.response.data.email || data.email);
        return;
      }
      const msg = err.response?.data?.message || 'Login failed.';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await resendEmailOtp(unverifiedEmail);
      toast.success('Verification email resent!');
    } catch {
      toast.error('Could not resend. Try again shortly.');
    } finally { setResending(false); }
  };

  // ── Unverified account screen ───────────────────────────────────────────
  if (unverifiedEmail) {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: '4rem', marginBottom: 12 }}>✉️</div>
          <h1 style={{ marginBottom: 8 }}>Email Not Verified</h1>
          <p style={{ color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24, fontSize: '0.95rem' }}>
            Your account (<strong>{unverifiedEmail}</strong>) is not verified yet.
            Please click the link we emailed you when you signed up.
          </p>
          <button
            className="btn btn--primary btn--full"
            onClick={handleResend}
            disabled={resending}
            style={{ marginBottom: 12 }}
          >
            {resending ? 'Sending…' : '🔄 Resend Verification Email'}
          </button>
          <button
            className="btn btn--outline btn--full"
            onClick={() => setUnverifiedEmail(null)}
          >
            ← Back to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-card__logo">
          <img src="/logo.png" alt="Batla Medicos" className="auth-card__logo-img" />
          <div className="auth-card__subtitle">Chemist &amp; Cosmetics</div>
        </div>

        <h1>Welcome Back</h1>
        <p className="auth-card__desc">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="form-input-wrap">
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={errors.email ? 'has-icon error' : 'has-icon'}
              />
              <span className="form-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </span>
            </div>
            {errors.email && <span className="form-error">⚠ {errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="form-input-wrap">
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                className={errors.password ? 'has-icon error' : 'has-icon'}
              />
              <span className="form-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
            </div>
            {errors.password && <span className="form-error">⚠ {errors.password.message}</span>}
          </div>

          <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -8 }}>
            <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>Forgot Password?</Link>
          </div>

          <button className="btn btn--primary btn--full btn--lg" type="submit" disabled={formLoading}>
            {formLoading ? <><span className="spinner spinner--sm" /> Signing in...</> : '→ Sign In'}
          </button>
        </form>

        <div className="form-divider">Or</div>
        <GoogleSignInButton redirectTo={from} />

        <p className="auth-switch">Don't have an account? <Link to="/register">Create Account</Link></p>
      </div>
    </main>
  );
}
