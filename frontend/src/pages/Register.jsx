import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { registerUser, verifyEmailOtp, resendEmailOtp } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().regex(/^\d{10}$/, '10-digit phone number required'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export default function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const otpRefs = useRef([]);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await registerUser(data);
      if (res.data.requiresOtp) {
        setRegisteredEmail(res.data.email);
        setStep('otp');
        toast.success('OTP sent to your email!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
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

  const onVerifyOtp = async () => {
    const otpValue = otp.join('');
    if (otpValue.length !== 6) { toast.error('Please enter the 6-digit OTP.'); return; }
    setOtpLoading(true);
    try {
      const res = await verifyEmailOtp(registeredEmail, otpValue);
      setUser(res.data.user);
      toast.success('Email verified! Welcome to Batla Medicos.');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally { setOtpLoading(false); }
  };

  const onResendOtp = async () => {
    setResendLoading(true);
    try {
      await resendEmailOtp(registeredEmail);
      toast.success('New OTP sent!');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend OTP.');
    } finally { setResendLoading(false); }
  };

  if (step === 'otp') {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 8 }}>📧</div>
          <h1 style={{ marginBottom: 8 }}>Verify Your Email</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
            We sent a 6-digit OTP to <strong>{registeredEmail}</strong>.<br />
            Enter it below to activate your account.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }} onPaste={handleOtpPaste}>
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
                  width: 48, height: 56, textAlign: 'center', fontSize: '1.5rem', fontWeight: 700,
                  border: '2px solid var(--border,#e0e0e0)', borderRadius: 10,
                  outline: 'none', color: '#C0392B',
                  transition: 'border-color .2s',
                }}
                onFocus={e => e.target.style.borderColor = '#C0392B'}
                onBlur={e => e.target.style.borderColor = 'var(--border,#e0e0e0)'}
              />
            ))}
          </div>

          <button
            className="btn btn--primary btn--full btn--lg"
            onClick={onVerifyOtp}
            disabled={otpLoading}
            style={{ marginBottom: 12 }}
          >
            {otpLoading ? <><span className="spinner spinner--sm" /> Verifying...</> : '✓ Verify & Continue'}
          </button>

          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: 8 }}>
            Didn't receive it? Check spam folder or{' '}
            <button
              onClick={onResendOtp}
              disabled={resendLoading}
              style={{ background: 'none', border: 'none', color: '#C0392B', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 'inherit' }}
            >
              {resendLoading ? 'Sending...' : 'Resend OTP'}
            </button>
          </p>
          <button
            onClick={() => setStep('form')}
            style={{ background: 'none', border: 'none', color: 'var(--gray-500)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
          >
            ← Use a different email
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

        <h1>Create Account</h1>
        <p className="auth-card__desc">Join for faster checkouts &amp; order tracking</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <div className="form-input-wrap">
              <input
                {...register('name')} id="name" type="text" autoComplete="name"
                placeholder="Your full name" className="has-icon"
              />
              <span className="form-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="5"/><path d="M3 21a9 9 0 0 1 18 0"/></svg>
              </span>
            </div>
            {errors.name && <span className="form-error">⚠ {errors.name.message}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email Address</label>
            <div className="form-input-wrap">
              <input
                {...register('email')} id="reg-email" type="email" autoComplete="email"
                placeholder="you@example.com" className="has-icon"
              />
              <span className="form-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
            </div>
            {errors.email && <span className="form-error">⚠ {errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Mobile Number</label>
            <div className="form-input-wrap">
              <input
                {...register('phone')} id="phone" type="tel" autoComplete="tel" maxLength={10}
                placeholder="10-digit number" className="has-icon"
              />
              <span className="form-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 2.15 7.18 2 2 0 0 1 4.11 5h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 12.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 19.92z"/></svg>
              </span>
            </div>
            {errors.phone && <span className="form-error">⚠ {errors.phone.message}</span>}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <div className="form-input-wrap">
                <input
                  {...register('password')} id="reg-password" type="password" autoComplete="new-password"
                  placeholder="Min 8 chars" className="has-icon"
                />
                <span className="form-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
              {errors.password && <span className="form-error">⚠ {errors.password.message}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="confirm">Confirm</label>
              <div className="form-input-wrap">
                <input
                  {...register('confirmPassword')} id="confirm" type="password" autoComplete="new-password"
                  placeholder="Re-enter" className="has-icon"
                />
                <span className="form-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 12 2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
              {errors.confirmPassword && <span className="form-error">⚠ {errors.confirmPassword.message}</span>}
            </div>
          </div>

          <button className="btn btn--primary btn--full btn--lg" type="submit" disabled={loading}>
            {loading ? <><span className="spinner spinner--sm" /> Creating...</> : '→ Create Account'}
          </button>
        </form>

        <div className="form-divider">Or</div>
        <GoogleSignInButton redirectTo="/" />

        <p className="auth-switch">Already have an account? <Link to="/login">Sign In</Link></p>
      </div>
    </main>
  );
}
