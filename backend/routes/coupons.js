'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query, execute } = require('../db/mysql');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

function mapCoupon(row) {
  return {
    _id:           String(row.id),
    code:          row.code,
    discountType:  row.discount_type,
    discountValue: Number(row.discount_value),
    minOrderValue: Number(row.min_order_value),
    maxDiscount:   row.max_discount != null ? Number(row.max_discount) : null,
    maxUses:       row.max_uses != null ? Number(row.max_uses) : null,
    usesCount:     Number(row.uses_count),
    expiresAt:     row.expires_at,
    isActive:      Boolean(row.is_active),
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

// ── Public: validate a coupon ───────────────────────────────────────────────
router.post('/validate', requireAuth, [
  body('code').trim().notEmpty(),
  body('cartTotal').isFloat({ min: 0 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const code = String(req.body.code).toUpperCase().trim();
    const cartTotal = Number(req.body.cartTotal);

    const rows = await query('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [code]);
    if (!rows.length) return res.status(404).json({ message: 'Invalid or expired coupon.' });

    const coupon = rows[0];

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ message: 'This coupon has expired.' });
    }
    if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) {
      return res.status(400).json({ message: 'This coupon has reached its usage limit.' });
    }
    if (cartTotal < Number(coupon.min_order_value)) {
      return res.status(400).json({
        message: `Minimum order value ₹${coupon.min_order_value} required for this coupon.`,
      });
    }

    let discount = coupon.discount_type === 'percent'
      ? (cartTotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);

    if (coupon.max_discount != null) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }
    discount = Math.min(discount, cartTotal);

    res.json({ valid: true, coupon: mapCoupon(coupon), discount: Math.round(discount * 100) / 100 });
  } catch (err) {
    next(err);
  }
});

// ── Admin: list all coupons ─────────────────────────────────────────────────
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM coupons ORDER BY created_at DESC', []);
    res.json(rows.map(mapCoupon));
  } catch (err) {
    next(err);
  }
});

// ── Admin: create coupon ────────────────────────────────────────────────────
router.post('/admin', requireAuth, requireAdmin, [
  body('code').trim().notEmpty().toUpperCase(),
  body('discountType').isIn(['percent', 'flat']),
  body('discountValue').isFloat({ min: 0.01 }),
  body('minOrderValue').optional().isFloat({ min: 0 }),
  body('maxDiscount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const { code, discountType, discountValue, minOrderValue, maxDiscount, maxUses, expiresAt, isActive } = req.body;
    const result = await execute(
      `INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_discount, max_uses, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(code).toUpperCase().trim(),
        discountType,
        Number(discountValue),
        Number(minOrderValue || 0),
        maxDiscount != null ? Number(maxDiscount) : null,
        maxUses != null ? Number(maxUses) : null,
        expiresAt || null,
        isActive !== false ? 1 : 0,
      ]
    );
    const rows = await query('SELECT * FROM coupons WHERE id = ?', [result.insertId]);
    res.status(201).json(mapCoupon(rows[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Coupon code already exists.' });
    next(err);
  }
});

// ── Admin: update coupon ────────────────────────────────────────────────────
router.put('/admin/:id', requireAuth, requireAdmin, [
  param('id').isInt({ min: 1 }),
  body('discountType').optional().isIn(['percent', 'flat']),
  body('discountValue').optional().isFloat({ min: 0.01 }),
  body('minOrderValue').optional().isFloat({ min: 0 }),
  body('isActive').optional().isBoolean(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const { id } = req.params;
    const { discountType, discountValue, minOrderValue, maxDiscount, maxUses, expiresAt, isActive, code } = req.body;

    const fields = [];
    const vals = [];
    if (code       !== undefined) { fields.push('code = ?');           vals.push(String(code).toUpperCase().trim()); }
    if (discountType  !== undefined) { fields.push('discount_type = ?');  vals.push(discountType); }
    if (discountValue !== undefined) { fields.push('discount_value = ?'); vals.push(Number(discountValue)); }
    if (minOrderValue !== undefined) { fields.push('min_order_value = ?'); vals.push(Number(minOrderValue)); }
    if (maxDiscount   !== undefined) { fields.push('max_discount = ?');   vals.push(maxDiscount != null ? Number(maxDiscount) : null); }
    if (maxUses       !== undefined) { fields.push('max_uses = ?');       vals.push(maxUses != null ? Number(maxUses) : null); }
    if (expiresAt     !== undefined) { fields.push('expires_at = ?');     vals.push(expiresAt || null); }
    if (isActive      !== undefined) { fields.push('is_active = ?');      vals.push(isActive ? 1 : 0); }

    if (!fields.length) return res.status(400).json({ message: 'Nothing to update.' });

    vals.push(id);
    await execute(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`, vals);
    const rows = await query('SELECT * FROM coupons WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Coupon not found.' });
    res.json(mapCoupon(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ── Admin: delete coupon ────────────────────────────────────────────────────
router.delete('/admin/:id', requireAuth, requireAdmin, [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const result = await execute('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Coupon not found.' });
    res.json({ message: 'Coupon deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
