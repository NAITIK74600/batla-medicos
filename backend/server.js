// Load backend/.env (override: true so .env wins over env vars, except PORT which Passenger controls)
const _savedPort = process.env.PORT;
require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
if (_savedPort) process.env.PORT = _savedPort;
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { verifySmtpConnection } = require('./utils/mailer');
const { ensureCoreSchema } = require('./db/schema');
const { monitorUnauthorizedResponses } = require('./middleware/securityLogger');

const authRoutes         = require('./routes/auth');
const productRoutes      = require('./routes/products');
const uploadRoutes       = require('./routes/upload');
const categoryRoutes     = require('./routes/categories');
const brandRoutes        = require('./routes/brands');
const chatRoutes         = require('./routes/chat');
const adminRoutes        = require('./routes/admin');
const geocodeRoutes      = require('./routes/geocode');
const couponRoutes       = require('./routes/coupons');
const deliveryRoutes     = require('./routes/delivery');
const labRoutes          = require('./routes/lab');
const orderRoutes        = require('./routes/orders');
const offerRoutes        = require('./routes/offers');
const reviewRoutes       = require('./routes/reviews');
const notificationRoutes = require('./routes/notifications');
const prescriptionRoutes = require('./routes/prescriptions');

const app = express();

function unsupportedRoute(message) {
  return (req, res) => res.status(503).json({ message });
}

// ── Trust proxy (needed for correct IP behind Vercel/Railway) ─────────────────
app.set('trust proxy', 1);

// ── Bypass localtunnel interstitial for all responses ─────────────────────────
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                   'https://checkout.razorpay.com', 'https://cdn.razorpay.com',
                   'https://accounts.google.com', 'https://apis.google.com', 'https://www.gstatic.com',
                   'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
      connectSrc: ["'self'", 'https://batlamedicos.shop', 'https://www.batlamedicos.shop',
                   'https://en.wikipedia.org', 'https://world.openfoodfacts.org',
                   'https://api.razorpay.com', 'https://lumberjack.razorpay.com',
                   'https://cdn.razorpay.com',
                   'https://accounts.google.com', 'https://www.googleapis.com',
                   'https://www.googletagmanager.com', 'https://www.google-analytics.com',
                   'https://region1.google-analytics.com', 'https://analytics.google.com'],
      fontSrc:    ["'self'", 'data:', 'https://fonts.gstatic.com'],
      frameSrc:   ["'self'", 'https://www.google.com', 'https://maps.google.com',
                   'https://api.razorpay.com', 'https://accounts.google.com',
                   'https://www.googletagmanager.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Extra headers not covered by Helmet defaults
app.use((req, res, next) => {
  // Allow geolocation for all origins so the frontend SPA can use GPS
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'https://batlamedicos.shop',
  'https://www.batlamedicos.shop',
  process.env.FRONTEND_URL,
  process.env.TUNNEL_URL,
].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header) and whitelisted origins
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    // Also allow *.trycloudflare.com and *.loca.lt tunnel URLs
    if (/\.trycloudflare\.com$/.test(origin) || /\.loca\.lt$/.test(origin) || /\.ngrok.*\.app$/.test(origin) || /\.onrender\.com$/.test(origin) || /\.netlify\.app$/.test(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Cookie parser ─────────────────────────────────────────────────────────────
app.use(cookieParser());

// ── Body parser — raw body preserved for Razorpay webhook ────────────────────
app.use('/api/orders/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
}));
// ── Monitor 401/403 patterns per IP (anomaly detection, must be before routes)
app.use(monitorUnauthorizedResponses);
// ── Force HTTPS in production ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (!isLocalHost && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/products',     productRoutes);
app.use('/api/orders',       orderRoutes);
app.use('/api/upload',       uploadRoutes);
app.use('/api/offers',       offerRoutes);
app.use('/api/categories',   categoryRoutes);
app.use('/api/brands',        brandRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/reviews',      reviewRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/prescriptions',  prescriptionRoutes);
app.use('/api/lab',            labRoutes);
app.use('/api/geocode',        geocodeRoutes);
app.use('/api/delivery',       deliveryRoutes);
app.use('/api/coupons',        couponRoutes);

// ── GitHub webhook deploy endpoint ───────────────────────────────────────────
// Called by GitHub Actions on every push to master. Runs git pull + restart.
// Protected by DEPLOY_SECRET env var — reject if secret mismatches.
const crypto = require('crypto');
// Use raw body so HMAC is computed on the exact bytes sent, not re-serialized JSON
app.post('/api/deploy', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DEPLOY_SECRET || '';
  if (!secret) return res.status(503).json({ message: 'Deploy secret not configured on server' });

  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body || '');
  const sig = req.headers['x-deploy-signature'] || '';
  const expectedHex = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual requires same-length buffers — length mismatch means invalid sig
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedHex);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) return res.status(401).json({ message: 'Invalid signature' });

  // git pull then touch Passenger restart file
  const { exec } = require('child_process');
  const repoRoot = require('path').join(__dirname, '..');
  const restartPath = require('path').join(repoRoot, 'tmp', 'restart.txt');
  exec(
    `cd "${repoRoot}" && git pull --ff-only origin master && mkdir -p "${require('path').dirname(restartPath)}" && touch "${restartPath}"`,
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ message: 'Deploy failed', error: err.message, stderr });
      res.json({ message: 'Deployed', stdout: stdout.trim(), time: new Date().toISOString() });
    }
  );
});

// ── Health check (admin-only to prevent info disclosure) ─────────────────────
const requireAuthMiddle  = require('./middleware/requireAuth');
const requireAdminMiddle = require('./middleware/requireAdmin');
app.get('/health', requireAuthMiddle, requireAdminMiddle, (req, res) => {
  res.json({
    status: 'ok',
    version: '2026-03-20',
    db: process.env.MYSQL_DATABASE ? 'mysql' : 'missing-mysql-config',
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'NOT configured',
  });
});

// ── sitemap.xml + robots.txt (SEO) ────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.join(__dirname, '..', 'frontend', 'dist', 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    res.setHeader('Content-Type', 'application/xml');
    return res.sendFile(sitemapPath);
  }
  res.status(404).send('Not found');
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://batlamedicos.shop/sitemap.xml\n');
});

// ── Serve uploaded files ───────────────────────────────────────────────────
const UPLOADS = path.join(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
  // Block any attempt to serve HTML/JS from the uploads folder to prevent stored XSS
  const ext = path.extname(req.path).toLowerCase();
  const blocked = ['.html', '.htm', '.js', '.mjs', '.cjs', '.svg', '.xml', '.php'];
  if (blocked.includes(ext)) return res.status(403).json({ message: 'Forbidden' });
  // Force download disposition for non-image files (e.g. PDFs served inline is fine, but not scripts)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  next();
}, express.static(UPLOADS, { maxAge: '7d' }));

// ── Serve React frontend (production build) ────────────────────────────
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
// Always register static + SPA fallback; check dist existence at request time
// so Passenger doesn't need a restart after the first build
app.use(express.static(DIST, {
  maxAge: '1h',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));
// React Router: any non-API route serves index.html
app.get(/(.*)/, (req, res) => {
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(503).json({ message: 'Frontend not built. Run: npm run build inside frontend/' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexPath);
});

// ── Global error handler — never expose stack traces in production ────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Handle Multer file upload errors with friendly messages
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File size too large. Please upload a smaller file.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ message: err.message || 'File upload error.' });
  }

  const status = err.status || 500;
  console.error('[ERROR]', req.method, req.originalUrl, err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err);
  // Show real message to admins, generic to everyone else
  const message = (req.user?.role === 'admin' || req.user?.role === 'superadmin')
    ? err.message
    : (process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message);
  res.status(status).json({ message });
});

// ── Database + Server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
let serverStarted = false;

function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  ensureCoreSchema()
    .then(() => {
      console.log('MySQL core schema ready');
      console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET ✓' : 'NOT SET ✗');
      verifySmtpConnection().catch(() => {});
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => {
      console.error('MySQL initialization failed:', err.message);
      process.exit(1);
    });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
