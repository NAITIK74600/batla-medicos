const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https = require('https');
const rateLimit = require('express-rate-limit');
const {
  findUserByEmail,
  findUserById,
  findUserByGoogleOrEmail,
  findUserByEmailVerifyToken,
  findUserByResetOtp,
  createUser,
  updateUser,
} = require('../db/users');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  deleteRefreshToken,
  deleteRefreshTokensForUser,
} = require('../utils/tokens');
const {
  sendMail,
  sendEmailVerification,
  sendPasswordResetOtp,
  sendEmailVerificationOtp,
  verifySmtpConnection,
} = require('../utils/mailer');
const { logSecurityEvent } = require('../middleware/securityLogger');

const router = express.Router();

function googleTokenExchange(code, redirectUri) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error_description || parsed.error));
          else resolve(parsed);
        } catch {
          reject(new Error('Failed to parse Google token response'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function decodeIdToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid id_token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function sanitizeUser(user) {
  return user.toSafeObject();
}

function makeOtpHash(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function makeFamilyMember(payload) {
  return {
    _id: crypto.randomUUID(),
    name: payload.name.trim(),
    relation: payload.relation.trim(),
    dob: payload.dob || null,
    bloodGroup: payload.bloodGroup || '',
    allergies: payload.allergies || '',
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limiter for login to slow brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed logins
});

router.post('/register', authLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
  body('phone').matches(/^\d{10}$/).withMessage('10-digit phone required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { name, email, phone, password } = req.body;
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 12);
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    const user = await createUser({
      name,
      email,
      phone,
      passwordHash,
      role: 'customer',
      authProvider: 'local',
      emailVerified: false,
      emailOtp: makeOtpHash(otp),
      emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      addresses: [],
      familyMembers: [],
      isBanned: false,
    });

    try {
      await sendEmailVerificationOtp(user.email, user.name, otp);
    } catch {
      return res.status(502).json({ message: 'Failed to send verification email. Please try again.' });
    }

    res.status(201).json({ requiresOtp: true, email: user.email });
  } catch (err) { next(err); }
});

router.post('/verify-email-otp', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('otp').matches(/^\d{6}$/).withMessage('6-digit OTP required.'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserByEmail(req.body.email);
    if (!user || user.emailVerified) return res.status(400).json({ message: 'Invalid or already verified.' });
    if (!user.emailOtp || !user.emailOtpExpiry || new Date(user.emailOtpExpiry) < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (makeOtpHash(req.body.otp) !== user.emailOtp) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    user.emailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpiry = null;
    const saved = await updateUser(user);

    const accessToken = signAccessToken(saved._id);
    const refreshToken = await signRefreshToken(saved._id);
    setAuthCookies(req, res, accessToken, refreshToken);
    res.json({ user: sanitizeUser(saved) });
  } catch (err) { next(err); }
});

router.post('/resend-email-otp', authLimiter, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const genericMsg = 'If that email is registered and unverified, a new OTP has been sent.';
    const user = await findUserByEmail(req.body.email);
    if (!user || user.emailVerified) return res.json({ message: genericMsg });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.emailOtp = makeOtpHash(otp);
    user.emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await updateUser(user);

    try {
      await sendEmailVerificationOtp(user.email, user.name, otp);
    } catch {
      return res.status(502).json({ message: 'Failed to send OTP. Please try again.' });
    }

    res.json({ message: genericMsg });
  } catch (err) { next(err); }
});

router.post('/login', loginLimiter, authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserByEmail(req.body.email);
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
    if (user.isBanned) return res.status(403).json({ message: 'Account is banned.' });
    if (user.isLocked()) return res.status(423).json({ message: 'Account locked. Try again later.' });
    if (!user.emailVerified && user.role === 'customer') {
      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email before logging in.',
      });
    }

    const valid = await user.comparePassword(req.body.password);
    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      await updateUser(user);
      logSecurityEvent('LOGIN_FAIL', {
        email: req.body.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        details: { attempts: user.failedLoginAttempts },
      });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    const saved = await updateUser(user);

    logSecurityEvent('LOGIN_SUCCESS', {
      userId: saved.id,
      email: saved.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const accessToken = signAccessToken(saved._id);
    const refreshToken = await signRefreshToken(saved._id);
    setAuthCookies(req, res, accessToken, refreshToken);
    res.json({ user: sanitizeUser(saved) });
  } catch (err) { next(err); }
});

// ── GET /api/auth/google/callback — server-side OAuth2 callback ─────────────
// Google redirects here after the user authorises the app.
// Exchanges the code, creates/updates the user, sets cookies, then redirects
// the browser to the frontend page stored in the `state` query param.
router.get('/google/callback', authLimiter, async (req, res) => {
  const { code, error, state } = req.query;
  const frontendBase = (process.env.FRONTEND_URL || 'https://batlamedicos.shop')
    .replace(/\/$/, '')
    .replace(/^(https?:\/\/)www\./, '$1'); // normalise www → non-www

  if (error || !code) {
    const hint = typeof error === 'string' ? encodeURIComponent(error) : 'no_code';
    return res.redirect(`${frontendBase}/login?google_error=${hint}`);
  }

  try {
    // Reconstruct redirect_uri exactly as it was sent during authorisation.
    // Both ends normalise www → non-www so the URI matches what is registered
    // in Google Cloud Console.
    const rawHost     = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const host        = (rawHost || new URL(frontendBase).host).replace(/^www\./, '');
    const proto       = req.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;

    const tokens = await googleTokenExchange(code, redirectUri);
    if (!tokens.id_token) throw new Error('No id_token received from Google.');

    const payload = decodeIdToken(tokens.id_token);
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new Error('Token audience mismatch.');
    }

    const { sub: googleId, email, name, email_verified: emailVerified } = payload;
    if (!emailVerified) {
      return res.redirect(`${frontendBase}/login?google_error=unverified_email`);
    }

    let user = await findUserByGoogleOrEmail(email, googleId);
    if (user) {
      if (user.isBanned) return res.redirect(`${frontendBase}/login?google_error=banned`);
      user.googleId      = googleId;
      user.emailVerified = true;
      user.authProvider  = user.authProvider === 'local' ? 'local' : 'google';
      user = await updateUser(user);
    } else {
      user = await createUser({
        name, email, phone: '', passwordHash: null,
        role: 'customer', authProvider: 'google', googleId,
        emailVerified: true, addresses: [], familyMembers: [], isBanned: false,
      });
    }

    const accessToken  = signAccessToken(user._id);
    const refreshToken = await signRefreshToken(user._id);
    setAuthCookies(req, res, accessToken, refreshToken);

    // Prevent open-redirect: only allow safe relative paths
    const safePath = (() => {
      if (!state) return '/';
      try {
        const decoded = decodeURIComponent(state);
        return /^\/[^/\\]/.test(decoded) || decoded === '/' ? decoded : '/';
      } catch { return '/'; }
    })();
    return res.redirect(`${frontendBase}${safePath}`);
  } catch (err) {
    console.error('[Google OAuth callback]', err.message);
    return res.redirect(`${frontendBase}/login?google_error=failed`);
  }
});

// ── POST /api/auth/google — legacy client-side flow (kept for compatibility) ──
router.post('/google', authLimiter, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(422).json({ message: 'Google authorization code required.' });

    // Normalise redirect URI: www → non-www to match Google Cloud Console registration
    const rawRedirectUri = req.body.redirectUri
      || process.env.GOOGLE_REDIRECT_URI
      || 'https://batlamedicos.shop/api/auth/google/callback';
    const redirectUri = String(rawRedirectUri).replace(
      /^(https?:\/\/)www\./i, '$1'
    );
    const tokens = await googleTokenExchange(code, redirectUri);
    if (!tokens.id_token) return res.status(401).json({ message: 'No id_token received from Google.' });

    const payload = decodeIdToken(tokens.id_token);
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ message: 'Token audience mismatch.' });
    }

    const { sub: googleId, email, name, email_verified: emailVerified } = payload;
    if (!emailVerified) return res.status(400).json({ message: 'Google email is not verified.' });

    let user = await findUserByGoogleOrEmail(email, googleId);
    if (user) {
      if (user.isBanned) return res.status(403).json({ message: 'Account is banned.' });
      user.googleId = googleId;
      user.emailVerified = true;
      user.authProvider = user.authProvider === 'local' ? 'local' : 'google';
      user = await updateUser(user);
    } else {
      user = await createUser({
        name,
        email,
        phone: '',
        passwordHash: null,
        role: 'customer',
        authProvider: 'google',
        googleId,
        emailVerified: true,
        addresses: [],
        familyMembers: [],
        isBanned: false,
      });
    }

    const accessToken = signAccessToken(user._id);
    const refreshToken = await signRefreshToken(user._id);
    setAuthCookies(req, res, accessToken, refreshToken);
    res.json({ user: sanitizeUser(user) });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token.' });

    const userId = await verifyRefreshToken(token);
    if (!userId) return res.status(401).json({ message: 'Invalid or expired refresh token.' });

    const user = await findUserById(userId);
    if (!user || user.isBanned) return res.status(401).json({ message: 'Unauthorized.' });

    const newAccessToken = signAccessToken(user._id);
    const newRefreshToken = await signRefreshToken(user._id);
    setAuthCookies(req, res, newAccessToken, newRefreshToken);
    res.json({ message: 'Token refreshed.' });
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) await deleteRefreshToken(token);
    clearAuthCookies(req, res);
    res.json({ message: 'Logged out.' });
  } catch (err) { next(err); }
});

const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

router.get('/verify-email/:token', async (req, res, next) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await findUserByEmailVerifyToken(hashed);
    if (!user) return res.status(400).json({ message: 'Verification link is invalid or has expired.' });

    user.emailVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpiry = null;
    const saved = await updateUser(user);

    const accessToken = signAccessToken(saved._id);
    const refreshToken = await signRefreshToken(saved._id);
    setAuthCookies(req, res, accessToken, refreshToken);
    res.json({ verified: true, user: sanitizeUser(saved) });
  } catch (err) { next(err); }
});

router.post('/resend-verification', authLimiter, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserByEmail(req.body.email);
    if (!user || user.emailVerified) {
      return res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    user.emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await updateUser(user);

    const verifyUrl = `${process.env.FRONTEND_URL || 'https://batlamedicos.shop'}/verify-email?token=${plainToken}`;
    try {
      await sendEmailVerification(user.email, user.name, verifyUrl);
    } catch {
      return res.status(502).json({ message: 'Failed to send verification email. Please try again in a few minutes.' });
    }

    res.json({ message: 'Verification email sent. Please check your inbox (and spam folder).' });
  } catch (err) { next(err); }
});

router.patch('/profile', requireAuth, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional().matches(/^\d{10}$/).withMessage('10-digit phone required.'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserById(req.user._id);
    user.name = req.body.name.trim();
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    const saved = await updateUser(user);

    res.json({ user: sanitizeUser(saved) });
  } catch (err) { next(err); }
});

router.post('/family', requireAuth, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('relation').trim().notEmpty().isLength({ max: 50 }),
  body('dob').optional({ nullable: true }).isISO8601(),
  body('bloodGroup').optional().isString().isLength({ max: 10 }),
  body('allergies').optional().isString().isLength({ max: 300 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserById(req.user._id);
    if ((user.familyMembers || []).length >= 10) return res.status(400).json({ message: 'Max 10 family members allowed.' });
    user.familyMembers = [...(user.familyMembers || []), makeFamilyMember(req.body)];
    const saved = await updateUser(user);
    res.status(201).json({ familyMembers: saved.familyMembers });
  } catch (err) { next(err); }
});

router.patch('/family/:memberId', requireAuth, [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('relation').optional().trim().notEmpty().isLength({ max: 50 }),
], async (req, res, next) => {
  try {
    const user = await findUserById(req.user._id);
    const idx = (user.familyMembers || []).findIndex((member) => String(member._id) === String(req.params.memberId));
    if (idx < 0) return res.status(404).json({ message: 'Family member not found.' });

    const member = { ...user.familyMembers[idx] };
    if (req.body.name !== undefined) member.name = req.body.name.trim();
    if (req.body.relation !== undefined) member.relation = req.body.relation.trim();
    if (req.body.dob !== undefined) member.dob = req.body.dob || null;
    if (req.body.bloodGroup !== undefined) member.bloodGroup = req.body.bloodGroup || '';
    if (req.body.allergies !== undefined) member.allergies = req.body.allergies || '';
    user.familyMembers[idx] = member;

    const saved = await updateUser(user);
    res.json({ familyMembers: saved.familyMembers });
  } catch (err) { next(err); }
});

router.delete('/family/:memberId', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user._id);
    const nextMembers = (user.familyMembers || []).filter((member) => String(member._id) !== String(req.params.memberId));
    if (nextMembers.length === (user.familyMembers || []).length) {
      return res.status(404).json({ message: 'Family member not found.' });
    }

    user.familyMembers = nextMembers;
    const saved = await updateUser(user);
    res.json({ familyMembers: saved.familyMembers });
  } catch (err) { next(err); }
});

router.post('/forgot-password', authLimiter, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const genericMsg = 'If that email is registered, a password reset link has been sent.';
    const user = await findUserByEmail(req.body.email);
    if (!user) return res.json({ message: genericMsg });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.resetOtp = makeOtpHash(otp);
    user.resetOtpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await updateUser(user);

    logSecurityEvent('PASSWORD_RESET_REQUEST', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    try {
      await sendPasswordResetOtp(user.email, user.name, otp);
    } catch {
      return res.status(502).json({ message: 'Could not send reset OTP. Please try again later.' });
    }

    res.json({ message: genericMsg, otpSent: true });
  } catch (err) { next(err); }
});

router.post('/reset-password', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('otp').matches(/^\d{6}$/).withMessage('6-digit OTP required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Must contain a number.'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const user = await findUserByResetOtp(req.body.email, makeOtpHash(req.body.otp));
    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });

    user.passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS) || 12);
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.emailVerified = true;
    await updateUser(user);
    await deleteRefreshTokensForUser(user._id);

    logSecurityEvent('PASSWORD_RESET_SUCCESS', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) { next(err); }
});

router.post('/test-smtp', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const ok = await verifySmtpConnection();
    if (!ok) {
      return res.status(502).json({
        ok: false,
        message: 'SMTP connection failed. Check MAIL_HOST, MAIL_USER, MAIL_PASS, MAIL_PORT in .env and ensure the cPanel email account exists.',
        env: {
          MAIL_HOST: process.env.MAIL_HOST || '(not set)',
          MAIL_PORT: process.env.MAIL_PORT || '(not set)',
          MAIL_USER: process.env.MAIL_USER || '(not set)',
          MAIL_FROM: process.env.MAIL_FROM || '(not set)',
          MAIL_PASS: process.env.MAIL_PASS ? '(set)' : '(NOT SET)',
        },
      });
    }

    const to = req.body.to || req.user.email;
    try {
      await sendMail(to, 'SMTP Test - Batla Medicos', `<p>This is a test email sent at ${new Date().toISOString()}.</p>`);
      return res.json({ ok: true, message: `Test email sent to ${to}` });
    } catch (mailErr) {
      return res.status(502).json({ ok: false, message: `SMTP connected but send failed: ${mailErr.message}` });
    }
  } catch (err) { next(err); }
});

module.exports = router;