'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query, execute } = require('../db/mysql');
const { findUserByEmail, createUser } = require('../db/users');
const requireAuth   = require('../middleware/requireAuth');
const requireAdmin  = require('../middleware/requireAdmin');
const { sendDeliveryAssignmentEmail, sendDeliveryBoyStatusEmail } = require('../utils/mailer');

const router = express.Router();

function mapBoy(row) {
  return {
    _id:         String(row.id),
    userId:      String(row.user_id),
    name:        row.name,
    phone:       row.phone,
    email:       row.email,
    status:      row.status,
    isAvailable: Boolean(row.is_available),
    lat:         row.lat != null ? Number(row.lat) : null,
    lng:         row.lng != null ? Number(row.lng) : null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── Delivery boy: register ──────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').trim().notEmpty(),
  body('password').isLength({ min: 6 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const { name, email, phone, password } = req.body;
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({
      name, email, phone, passwordHash,
      role: 'customer',
      authProvider: 'local',
      emailVerified: true,
      addresses: [], familyMembers: [], isBanned: false,
    });

    await execute(
      `INSERT INTO delivery_boys (user_id, name, phone, email, status) VALUES (?, ?, ?, ?, 'pending')`,
      [user.id, name, phone, email]
    );
    res.status(201).json({ message: 'Registration submitted. Wait for admin approval.' });
  } catch (err) {
    next(err);
  }
});

// ── Delivery boy: get own profile ───────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM delivery_boys WHERE user_id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Delivery profile not found.' });
    res.json(mapBoy(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ── Delivery boy: toggle availability ──────────────────────────────────────
router.patch('/availability', requireAuth, [
  body('isAvailable').isBoolean(),
], async (req, res, next) => {
  try {
    await execute(
      'UPDATE delivery_boys SET is_available = ? WHERE user_id = ?',
      [req.body.isAvailable ? 1 : 0, req.user.id]
    );
    res.json({ message: 'Availability updated.' });
  } catch (err) {
    next(err);
  }
});

// ── Delivery boy: update location ───────────────────────────────────────────
router.patch('/location', requireAuth, [
  body('lat').isFloat(),
  body('lng').isFloat(),
], async (req, res, next) => {
  try {
    await execute(
      'UPDATE delivery_boys SET lat = ?, lng = ? WHERE user_id = ?',
      [req.body.lat, req.body.lng, req.user.id]
    );
    res.json({ message: 'Location updated.' });
  } catch (err) {
    next(err);
  }
});

// ── Delivery boy: get assigned orders ──────────────────────────────────────
router.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const boys = await query('SELECT id FROM delivery_boys WHERE user_id = ?', [req.user.id]);
    if (!boys.length) return res.status(404).json({ message: 'Delivery profile not found.' });
    const orders = await query(
      `SELECT * FROM orders WHERE delivery_boy_id = ? AND status NOT IN ('delivered','cancelled') ORDER BY created_at DESC`,
      [boys[0].id]
    );
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// ── Delivery boy: order history ─────────────────────────────────────────────
router.get('/orders/history', requireAuth, async (req, res, next) => {
  try {
    const boys = await query('SELECT id FROM delivery_boys WHERE user_id = ?', [req.user.id]);
    if (!boys.length) return res.status(404).json({ message: 'Delivery profile not found.' });
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const orders = await query(
      `SELECT * FROM orders WHERE delivery_boy_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [boys[0].id, limit, offset]
    );
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// ── Admin: list all delivery boys ───────────────────────────────────────────
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM delivery_boys';
    const vals = [];
    if (status && ['pending', 'active', 'suspended'].includes(status)) {
      sql += ' WHERE status = ?';
      vals.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, vals);
    res.json(rows.map(mapBoy));
  } catch (err) {
    next(err);
  }
});

// ── Admin: get available delivery boys ──────────────────────────────────────
router.get('/admin/available', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM delivery_boys WHERE status = 'active' AND is_available = 1 ORDER BY name ASC`,
      []
    );
    res.json(rows.map(mapBoy));
  } catch (err) {
    next(err);
  }
});

// ── Admin: update delivery boy status ───────────────────────────────────────
router.patch('/admin/:id/status', requireAuth, requireAdmin, [
  param('id').isInt({ min: 1 }),
  body('status').isIn(['pending', 'active', 'suspended']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const result = await execute(
      'UPDATE delivery_boys SET status = ? WHERE id = ?',
      [req.body.status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Delivery boy not found.' });
    const rows = await query('SELECT * FROM delivery_boys WHERE id = ?', [req.params.id]);

    // Send email on approval/suspension
    if (req.body.status === 'active' || req.body.status === 'suspended') {
      try {
        await sendDeliveryBoyStatusEmail(rows[0].email, rows[0].name, req.body.status);
      } catch (emailErr) { console.error('[mailer] delivery boy status email failed:', emailErr.message); }
    }

    res.json(mapBoy(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ── Admin: assign order to delivery boy ─────────────────────────────────────
router.post('/admin/assign', requireAuth, requireAdmin, [
  body('orderId').isInt({ min: 1 }),
  body('deliveryBoyId').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const { orderId, deliveryBoyId } = req.body;
    const result = await execute(
      `UPDATE orders SET delivery_boy_id = ?, status = 'out_for_delivery' WHERE id = ?`,
      [deliveryBoyId, orderId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Order not found.' });

    // Send email to customer about delivery assignment
    try {
      const orderRows = await query('SELECT o.user_id, u.email, u.name FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?', [orderId]);
      const boyRows = await query('SELECT name FROM delivery_boys WHERE id = ?', [deliveryBoyId]);
      if (orderRows[0]?.email) {
        await sendDeliveryAssignmentEmail(orderRows[0].email, orderRows[0].name, orderId, boyRows[0]?.name || '');
      }
    } catch (emailErr) { console.error('[mailer] delivery assignment email failed:', emailErr.message); }

    res.json({ message: 'Order assigned to delivery boy.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
