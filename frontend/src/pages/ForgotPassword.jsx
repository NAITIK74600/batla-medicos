import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { forgotPassword, resetPassword } from '../api/auth';

const emailSchema = z.object({
  email: z.string().email('Valid email required'),
});

const passwordSchema = z.object({
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [sentEmail, setSentEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendLoading, setResendLoading] = useState(false);
  const otpRefs = useRef([]);

  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(emailSchema) });
  const { register: regPass, handleSubmit: handlePassSubmit, formState: { errors: passErrors } } = useForm({ resolver: zodResolver(passwordSchema) });

  const onEmailSubmit = async ({ email }) => {
    setLoading(true);
    try {
      await forgotPassword(email);
      setSentEmail(email);
      setStep('otp');
      toast.success('OTP sent to your email!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const onResendOtp = async () => {
    setResendLoading(true);
    try {
      await forgotPassword(sentEmail);
      toast.success('New OTP sent!');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err) {
      toast.error('Could not resend OTP.');
    } finally { setResendLoading(false); }
  };

  const onPasswordSubmit = async ({ password }) => {
    const otpValue = otp.join('');
    if (otpValue.length !== 6) { toast.error('Please enter the 6-digit OTP first.'); return; }
    setLoading(true);
    try {
      await resetPassword(sentEmail, otpValue, password);
      toast.success('Password reset successfully! Please log in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed. Please try again.');
    } finally { setLoading(false); }
  };

  if (step === 'otp') {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ maxWidth: 440 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔐</div>
            <h1 style={{ marginBottom: 6 }}>Enter OTP &amp; New Password</h1>
            <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              We sent a 6-digit OTP to <strong>{sentEmail}</strong>.<br />
              Enter it below along with your new password.
            </p>
          </div>

          {/* OTP boxes */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => otpRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                style={{
                  width: 46, height: 54, textAlign: 'center', fontSize: '1.4rem', fontWeight: 700,
                  border: '2px solid var(--border,#e0e0e0)', borderRadius: 10,
                  outline: 'none', color: '#1565c0',
                  transition: 'border-color .2s',
                }}
                onFocus={e => e.target.style.borderColor = '#1565c0'}
                onBlur={e => e.target.style.borderColor = 'var(--border,#e0e0e0)'}
              />
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 20 }}>
            Didn't receive it?{' '}
            <button
              onClick={onResendOtp}
              disabled={resendLoading}
              style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 'inherit' }}
            >
              {resendLoading ? 'Sending...' : 'Resend OTP'}
            </button>
          </p>

          {/* New password form */}
          <form onSubmit={handlePassSubmit(onPasswordSubmit)} noValidate>
            <div className="form-group">
              <label htmlFor="new-pass">New Password</label>
              <div className="form-input-wrap">
                <input
                  {...regPass('password')}
                  id="new-pass"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  className="has-icon"
                />
                <span className="form-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
              {passErrors.password && <span className="form-error">⚠ {passErrors.password.message}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirm-pass">Confirm Password</label>
              <div className="form-input-wrap">
                <input
                  {...regPass('confirmPassword')}
                  id="confirm-pass"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  className="has-icon"
                />
                <span className="form-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 12 2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
              {passErrors.confirmPassword && <span className="form-error">⚠ {passErrors.confirmPassword.message}</span>}
            </div>

            <button className="btn btn--primary btn--full btn--lg" type="submit" disabled={loading}>
              {loading ? <><span className="spinner spinner--sm" /> Resetting...</> : '🔑 Reset Password'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={() => setStep('email')}
              style={{ background: 'none', border: 'none', color: 'var(--gray-500)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ← Use a different email
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <img src="/logo.png" alt="Batla Medicos" className="auth-card__logo-img" />
          <div className="auth-card__subtitle">Chemist &amp; Cosmetics</div>
        </div>

        <h1>Forgot Password?</h1>
        <p className="auth-card__desc">Enter your registered email and we'll send you a reset OTP</p>

        <form onSubmit={handleSubmit(onEmailSubmit)} noValidate>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="form-input-wrap">
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="has-icon"
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

          <button className="btn btn--primary btn--full btn--lg" type="submit" disabled={loading}>
            {loading ? <><span className="spinner spinner--sm" /> Sending...</> : '→ Send OTP'}
          </button>
        </form>

        <p className="auth-switch" style={{ marginTop: 16 }}>
          Remember your password? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </main>
  );
}
