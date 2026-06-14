const LOGO_CID = 'batlalogo';
const path = require('path');

/**
 * Mailer utility — sends transactional emails via cPanel SMTP
 *
 * Set these in .env:
 *   MAIL_HOST     = mail.batlamedicos.shop
 *   MAIL_PORT     = 465
 *   MAIL_USER     = ordersupport@batlamedicos.shop
 *   MAIL_PASS     = <cPanel email password>
 *   MAIL_FROM     = "Batla Medicos" <ordersupport@batlamedicos.shop>
 *
 * cPanel NOTES:
 *   - Port 465 uses SSL  → secure: true  (recommended)
 *   - Port 587 uses STARTTLS → secure: false
 *   - cPanel often uses a self-signed/shared-hosting cert for mail.domain.com
 *     so we set tls.rejectUnauthorized = false to allow it.
 */
const nodemailer = require('nodemailer');

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;

  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) {
    console.warn('[mailer] SMTP not configured — MAIL_HOST / MAIL_USER / MAIL_PASS missing in .env');
    return null;
  }

  // Trim any accidental whitespace (common in cPanel env editors)
  const host = MAIL_HOST.trim();
  const user = MAIL_USER.trim();
  const pass = MAIL_PASS.trim();

  const port   = parseInt(MAIL_PORT) || 465;
  const secure = port === 465; // SSL for 465, STARTTLS for 587

  _transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:   { user, pass },
    // cPanel mail servers commonly use self-signed or shared-hosting certs;
    // without this flag nodemailer throws CERT_HAS_EXPIRED / SELF_SIGNED_CERT
    tls:    { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  return _transport;
}

/**
 * Verify SMTP connection — call at server startup to surface config issues early.
 * Logs result; never throws.
 */
async function verifySmtpConnection() {
  const transport = getTransport();
  if (!transport) {
    console.warn('[mailer] SMTP disabled — no transport configured.');
    return false;
  }
  try {
    await transport.verify();
    console.log('[mailer] ✅ SMTP connection OK —', process.env.MAIL_USER, 'via', process.env.MAIL_HOST);
    return true;
  } catch (err) {
    console.error('[mailer] ❌ SMTP connection FAILED:', err.message);
    // Reset cached transport so it's retried on next server restart
    _transport = null;
    return false;
  }
}

/**
 * Send an email.
 * Throws if SMTP is not configured so calling code can surface the error.
 * @param {string} to        — recipient email
 * @param {string} subject   — subject line
 * @param {string} html      — HTML body
 */
async function sendMail(to, subject, html) {
  const transport = getTransport();
  if (!transport) {
    throw new Error('SMTP is not configured on the server. Please contact the administrator.');
  }

  const from = process.env.MAIL_FROM || '"Batla Medicos" <ordersupport@batlamedicos.shop>';

  // Embed logo as inline CID attachment so email clients show it without blocking
  const logoPath = path.resolve(__dirname, '../../frontend/public/email-logo.png');
  const attachments = [];
  try {
    const fs = require('fs');
    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: 'logo.png',
        path: logoPath,
        cid: LOGO_CID,
      });
    }
  } catch (_) { /* skip logo if not found */ }

  try {
    const info = await transport.sendMail({ from, to, subject, html, attachments });
    console.log(`[mailer] ✅ Sent to ${to}: ${subject} (msgId: ${info.messageId})`);
  } catch (err) {
    // Reset transport so a bad connection doesn't stay cached forever
    _transport = null;
    console.error('[mailer] ❌ Failed to send to', to, '\n  Error:', err.message, '\n  Code:', err.code);
    throw err; // Re-throw so callers know it failed
  }
}

// ── Pre-built email templates ──────────────────────────────────────────────────

/**
 * Order placed confirmation email to customer
 */
async function sendOrderConfirmation(userEmail, userName, order) {
  if (!userEmail) return;
  const orderId = order._id.toString().slice(-6).toUpperCase();
  const itemsHtml = (order.items || [])
    .map(i => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${i.name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${i.qty}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹${(i.price * i.qty).toFixed(2)}</td>
    </tr>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#2e7d32;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">✅ Order Confirmed!</h1>
      <p style="color:#c8e6c9;margin:8px 0 0;font-size:14px">Order #${orderId}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        Thank you for shopping with <strong>Batla Medicos</strong>! Your order has been placed successfully.
      </p>

      <!-- Order Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#f9f9f9">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#666;border-bottom:2px solid #eee">Product</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#666;border-bottom:2px solid #eee">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;color:#666;border-bottom:2px solid #eee">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:10px 12px;font-weight:700;font-size:15px;color:#333">Total</td>
            <td style="padding:10px 12px;font-weight:700;font-size:15px;color:#2e7d32;text-align:right">₹${Number(order.total || 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Delivery Type -->
      <div style="background:#f0f7f0;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#2e7d32">
        🚚 <strong>${order.deliveryType === 'takeaway' ? 'Takeaway' : 'Home Delivery'}</strong>
        ${order.deliveryType === 'takeaway' && order.takeawaySlot ? ` — Slot: ${order.takeawaySlot}` : ''}
      </div>

      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        We will notify you once your order is dispatched. For any queries, contact us on WhatsApp or call us.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/orders" style="background:#2e7d32;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">View My Orders</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — F 41/2, Nafees Road, Batla House, New Delhi – 110025</p>
      <p style="margin:6px 0 0;font-size:13px;color:#888">📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;

  await sendMail(userEmail, `Order Confirmed #${orderId} — Batla Medicos`, html);
}

/**
 * Order status update email to customer
 */
async function sendOrderStatusUpdate(userEmail, userName, order, status) {
  if (!userEmail) return;
  const orderId = order._id.toString().slice(-6).toUpperCase();

  const STATUS_INFO = {
    confirmed:  { emoji: '📦', label: 'Order Confirmed',  color: '#1565c0', msg: 'Your order has been confirmed and is being prepared.' },
    dispatched: { emoji: '🚚', label: 'Order Dispatched', color: '#e65100', msg: 'Your order is on the way! Our delivery partner will reach you soon.' },
    delivered:  { emoji: '🎉', label: 'Order Delivered',  color: '#2e7d32', msg: 'Your order has been delivered successfully. Thank you for shopping with us!' },
    cancelled:  { emoji: '❌', label: 'Order Cancelled',  color: '#c62828', msg: 'Your order has been cancelled. If you have any questions, please contact us.' },
  };

  const info = STATUS_INFO[status];
  if (!info) return; // Don't send for 'placed' (already handled by sendOrderConfirmation)

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:${info.color};padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">${info.emoji} ${info.label}</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Order #${orderId}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">${info.msg}</p>
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/orders" style="background:${info.color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">View Order</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;

  await sendMail(userEmail, `${info.emoji} ${info.label} #${orderId} — Batla Medicos`, html);
}

/**
 * Email verification link email
 */
async function sendEmailVerification(userEmail, userName, verifyUrl) {
  if (!userEmail) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#3451D1;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">✉️ Verify Your Email</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">One last step to activate your account</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'there'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        Thanks for registering at <strong>Batla Medicos</strong>! Please click the button below to verify
        your email address. This link expires in <strong>24 hours</strong>.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${verifyUrl}" style="background:#3451D1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;display:inline-block">
          ✅ Verify My Email
        </a>
      </div>
      <p style="margin:24px 0 0;color:#888;font-size:13px;line-height:1.5">
        If you did not create an account, you can safely ignore this email.<br>
        Button not working? Copy this link into your browser:<br>
        <a href="${verifyUrl}" style="color:#3451D1;word-break:break-all">${verifyUrl}</a>
      </p>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, 'Verify your email — Batla Medicos', html);
}

/**
 * Lab booking confirmation email to customer
 */
async function sendLabBookingConfirmation(userEmail, userName, booking) {
  if (!userEmail) return;
  const bookingId = String(booking._id || booking.id);
  const testsHtml = (booking.testSnapshots || [])
    .map(t => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${t.name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹${Number(t.price).toFixed(2)}</td>
    </tr>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1565c0;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">🧪 Lab Test Booked!</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Booking #${bookingId}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        Your lab test booking has been placed successfully. We will confirm it shortly.
      </p>
      <div style="background:#e8f0fb;border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:14px;color:#1565c0">
        👤 Patient: <strong>${booking.patientName || ''}</strong><br>
        📅 Date: <strong>${booking.bookingDate || ''}</strong> &nbsp; 🕐 Slot: <strong>${booking.slot || ''}</strong><br>
        📍 Collection: <strong>${booking.collectionType === 'home' ? 'Home Collection' : 'Visit Center'}</strong>
      </div>
      ${testsHtml ? `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead><tr style="background:#f9f9f9">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#666;border-bottom:2px solid #eee">Test</th>
          <th style="padding:8px 12px;text-align:right;font-size:13px;color:#666;border-bottom:2px solid #eee">Price</th>
        </tr></thead>
        <tbody>${testsHtml}</tbody>
        <tfoot><tr>
          <td style="padding:10px 12px;font-weight:700;font-size:15px;color:#333">Total</td>
          <td style="padding:10px 12px;font-weight:700;font-size:15px;color:#1565c0;text-align:right">₹${Number(booking.totalAmount || 0).toFixed(2)}</td>
        </tr></tfoot>
      </table>` : ''}
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/lab" style="background:#1565c0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">View My Bookings</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, `🧪 Lab Test Booked #${bookingId} — Batla Medicos`, html);
}

/**
 * Lab booking status update email to customer
 */
async function sendLabStatusUpdate(userEmail, userName, booking, status) {
  if (!userEmail) return;
  const bookingId = String(booking._id || booking.id);

  const STATUS_INFO = {
    confirmed:        { emoji: '✅', label: 'Booking Confirmed',    color: '#2e7d32', msg: 'Your lab test booking has been confirmed. Please be ready for sample collection.' },
    sample_collected: { emoji: '🩸', label: 'Sample Collected',     color: '#e65100', msg: 'Your sample has been collected and is being sent to the lab for processing.' },
    processing:       { emoji: '🔬', label: 'Processing',           color: '#7b1fa2', msg: 'Your sample is currently being processed in the lab.' },
    report_ready:     { emoji: '📋', label: 'Report Ready',         color: '#1565c0', msg: 'Your lab test report is ready! You can download it from your bookings page.' },
    completed:        { emoji: '🎉', label: 'Booking Completed',    color: '#2e7d32', msg: 'Your lab test booking has been completed. Thank you for choosing Batla Medicos!' },
    cancelled:        { emoji: '❌', label: 'Booking Cancelled',    color: '#c62828', msg: 'Your lab test booking has been cancelled. If you have any questions, please contact us.' },
  };

  const info = STATUS_INFO[status];
  if (!info) return;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:${info.color};padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">${info.emoji} ${info.label}</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Booking #${bookingId}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">${info.msg}</p>
      <div style="background:#f0f7f0;border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:14px;color:#333">
        👤 Patient: <strong>${booking.patientName || ''}</strong><br>
        📅 Date: <strong>${booking.bookingDate || ''}</strong>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/lab" style="background:${info.color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">View Booking</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, `${info.emoji} ${info.label} #${bookingId} — Batla Medicos`, html);
}

/**
 * Prescription status update email to customer
 */
async function sendPrescriptionUpdate(userEmail, userName, prescriptionId, status, adminNote) {
  if (!userEmail) return;

  const STATUS_INFO = {
    approved: { emoji: '✅', label: 'Prescription Approved', color: '#2e7d32', msg: 'Your prescription has been reviewed and approved. We will prepare your order shortly.' },
    rejected: { emoji: '❌', label: 'Prescription Rejected', color: '#c62828', msg: 'Unfortunately, your prescription could not be approved. Please check the note below or upload a new one.' },
  };

  const info = STATUS_INFO[status];
  if (!info) return;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:${info.color};padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">${info.emoji} ${info.label}</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Prescription #${prescriptionId}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">${info.msg}</p>
      ${adminNote ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:14px;color:#856404">
        📝 <strong>Note from pharmacist:</strong> ${adminNote}
      </div>` : ''}
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/prescriptions" style="background:${info.color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">View Prescriptions</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, `${info.emoji} ${info.label} — Batla Medicos`, html);
}

/**
 * Delivery assignment email to customer — their order is out for delivery
 */
async function sendDeliveryAssignmentEmail(userEmail, userName, orderId, deliveryBoyName) {
  if (!userEmail) return;
  const shortId = String(orderId).slice(-6).toUpperCase();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#e65100;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">🚚 Out for Delivery!</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Order #${shortId}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'Customer'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        Great news! Your order has been assigned to a delivery partner${deliveryBoyName ? ` (<strong>${deliveryBoyName}</strong>)` : ''} and is on its way to you.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/orders" style="background:#e65100;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">Track Order</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, `🚚 Order Out for Delivery #${shortId} — Batla Medicos`, html);
}

/**
 * Delivery boy registration status email
 */
async function sendDeliveryBoyStatusEmail(email, name, status) {
  if (!email) return;

  const STATUS_INFO = {
    active:    { emoji: '✅', label: 'Application Approved', color: '#2e7d32', msg: 'Congratulations! Your delivery partner application has been approved. You can now start accepting delivery orders.' },
    suspended: { emoji: '⚠️', label: 'Account Suspended',   color: '#c62828', msg: 'Your delivery partner account has been suspended. Please contact the admin for more information.' },
  };

  const info = STATUS_INFO[status];
  if (!info) return;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:${info.color};padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">${info.emoji} ${info.label}</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Delivery Partner Update</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${name || 'there'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">${info.msg}</p>
      <div style="text-align:center;margin:24px 0">
        <a href="https://batlamedicos.shop/delivery" style="background:${info.color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">Go to Dashboard</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(email, `${info.emoji} ${info.label} — Batla Medicos`, html);
}

module.exports = { sendMail, sendOrderConfirmation, sendOrderStatusUpdate, sendEmailVerification, sendPasswordReset, sendEmailVerificationOtp, sendPasswordResetOtp, verifySmtpConnection, sendLabBookingConfirmation, sendLabStatusUpdate, sendPrescriptionUpdate, sendDeliveryAssignmentEmail, sendDeliveryBoyStatusEmail };

/**
 * Password reset email
 */
async function sendPasswordReset(userEmail, userName, resetUrl) {
  if (!userEmail) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1565c0;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">🔐 Reset Your Password</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Batla Medicos Account Security</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'there'}</strong>,</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
        We received a request to reset the password for your Batla Medicos account.<br>
        Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#1565c0;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;display:inline-block">
          🔑 Reset My Password
        </a>
      </div>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#856404">
        ⚠️ If you did not request a password reset, please ignore this email. Your password will not change.
      </div>
      <p style="margin:0;color:#888;font-size:13px;line-height:1.5">
        Button not working? Copy this link into your browser:<br>
        <a href="${resetUrl}" style="color:#1565c0;word-break:break-all">${resetUrl}</a>
      </p>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, '🔐 Reset Your Password — Batla Medicos', html);
}

/**
 * Email verification OTP email (sent on registration)
 */
async function sendEmailVerificationOtp(userEmail, userName, otp) {
  if (!userEmail) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#3451D1;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">✉️ Verify Your Email</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Batla Medicos — Account Activation</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'there'}</strong>,</p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
        Thanks for creating a <strong>Batla Medicos</strong> account! Use the OTP below to verify your email address.
        It expires in <strong>10 minutes</strong>.
      </p>
      <div style="background:#f0eded;border-radius:10px;padding:20px;text-align:center;margin:24px 0">
        <p style="margin:0 0 6px;font-size:13px;color:#888;letter-spacing:1px;text-transform:uppercase">Your OTP</p>
        <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:12px;color:#3451D1">${otp}</p>
      </div>
      <p style="margin:0;color:#888;font-size:13px;line-height:1.5">
        If you didn't create an account, please ignore this email.
      </p>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, '🔑 Your Verification OTP — Batla Medicos', html);
}

/**
 * Password reset OTP email (sent on forgot-password request)
 */
async function sendPasswordResetOtp(userEmail, userName, otp) {
  if (!userEmail) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1565c0;padding:28px 32px;text-align:center">
      <img src="cid:${LOGO_CID}" alt="Batla Medicos" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">
      <h1 style="color:#fff;margin:0;font-size:22px">🔐 Reset Your Password</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">Batla Medicos Account Security</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;color:#333;font-size:15px">Hello <strong>${userName || 'there'}</strong>,</p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
        We received a request to reset your password. Enter the OTP below to set a new password.
        It expires in <strong>15 minutes</strong>.
      </p>
      <div style="background:#e8f0fb;border-radius:10px;padding:20px;text-align:center;margin:24px 0">
        <p style="margin:0 0 6px;font-size:13px;color:#888;letter-spacing:1px;text-transform:uppercase">Your OTP</p>
        <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:12px;color:#1565c0">${otp}</p>
      </div>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;font-size:13px;color:#856404">
        ⚠️ If you did not request a password reset, please ignore this email.
      </div>
    </div>
    <div style="background:#f9f9f9;padding:18px 32px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:13px;color:#888">Batla Medicos — 📞 9990165925 &nbsp;|&nbsp; 📧 ordersupport@batlamedicos.shop</p>
    </div>
  </div>
</body>
</html>`;
  await sendMail(userEmail, '🔐 Password Reset OTP — Batla Medicos', html);
}

