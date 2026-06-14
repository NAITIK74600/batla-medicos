const express = require('express');
const { body, param, validationResult } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { query, execute } = require('../db/mysql');

const router = express.Router();

function mapOffer(row) {
  return {
    _id: String(row.id),
    title: row.title,
    description: row.description || '',
    imageUrl: row.image_url || '',
    link: row.link || '',
    badge: row.badge || '',
    isActive: Boolean(row.is_active),
    ord: row.ord,
    displayOn: row.display_on || 'both',
    startDate: row.start_date,
    endDate: row.end_date,
    clicks: Number(row.clicks || 0),
    createdAt: row.created_at,
  };
}

// GET /api/offers — active offers (public)
router.get('/', async (req, res, next) => {
  try {
    const display = req.query.display;
    let sql = `SELECT * FROM offers WHERE is_active = 1
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())`;
    const vals = [];
    if (display && ['home', 'products'].includes(display)) {
      sql += ` AND (display_on = ? OR display_on = 'both')`;
      vals.push(display);
    }
    sql += ` ORDER BY ord ASC, created_at DESC`;
    const rows = await query(sql, vals);
    res.json({ offers: rows.map(mapOffer) });
  } catch (err) { next(err); }
});

// GET /api/offers/all — admin: all offers
router.get('/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM offers ORDER BY ord ASC, created_at DESC', []);
    res.json({ offers: rows.map(mapOffer) });
  } catch (err) { next(err); }
});

// GET /api/offers/stats
router.get('/stats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [total] = await query('SELECT COUNT(*) AS cnt FROM offers', []);
    const [active] = await query('SELECT COUNT(*) AS cnt FROM offers WHERE is_active = 1', []);
    const [clicks] = await query('SELECT SUM(clicks) AS total FROM offers', []);
    res.json({
      total: Number(total.cnt),
      active: Number(active.cnt),
      totalClicks: Number(clicks.total || 0),
    });
  } catch (err) { next(err); }
});

// POST /api/offers — create
router.post('/', requireAuth, requireAdmin, [
  body('title').trim().notEmpty().isLength({ max: 200 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    const { title, description, imageUrl, link, badge, isActive, startDate, endDate, ord, displayOn } = req.body;
    const result = await execute(
      `INSERT INTO offers (title, description, image_url, link, badge, is_active, start_date, end_date, ord, display_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || '', imageUrl || '', link || '', badge || '', isActive !== false ? 1 : 0, startDate || null, endDate || null, ord || 0, ['home', 'products', 'both'].includes(displayOn) ? displayOn : 'both']
    );
    const rows = await query('SELECT * FROM offers WHERE id = ?', [result.insertId]);
    res.status(201).json(mapOffer(rows[0]));
  } catch (err) { next(err); }
});

// PUT /api/offers/:id — update
router.put('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    const { title, description, imageUrl, link, badge, isActive, startDate, endDate, ord, displayOn } = req.body;
    await execute(
      `UPDATE offers SET title = ?, description = ?, image_url = ?, link = ?, badge = ?,
       is_active = ?, start_date = ?, end_date = ?, ord = ?, display_on = ? WHERE id = ?`,
      [title, description || '', imageUrl || '', link || '', badge || '',
       isActive !== false ? 1 : 0, startDate || null, endDate || null, ord || 0, ['home', 'products', 'both'].includes(displayOn) ? displayOn : 'both', req.params.id]
    );
    const rows = await query('SELECT * FROM offers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Offer not found.' });
    res.json(mapOffer(rows[0]));
  } catch (err) { next(err); }
});

// DELETE /api/offers/:id
router.delete('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    await execute('DELETE FROM offers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Offer deleted.' });
  } catch (err) { next(err); }
});

// POST /api/offers/:id/duplicate
router.post('/:id/duplicate', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM offers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Offer not found.' });
    const o = rows[0];
    const result = await execute(
      `INSERT INTO offers (title, description, image_url, link, badge, is_active, start_date, end_date, display_on)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [`${o.title} (Copy)`, o.description, o.image_url, o.link, o.badge, o.start_date, o.end_date, o.display_on || 'both']
    );
    const dup = await query('SELECT * FROM offers WHERE id = ?', [result.insertId]);
    res.status(201).json(mapOffer(dup[0]));
  } catch (err) { next(err); }
});

// POST /api/offers/:id/click
router.post('/:id/click', [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    await execute('UPDATE offers SET clicks = clicks + 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Click tracked.' });
  } catch (err) { next(err); }
});

// PATCH /api/offers/reorder
router.patch('/reorder', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(422).json({ message: 'order must be an array.' });
    for (let i = 0; i < order.length; i++) {
      await execute('UPDATE offers SET ord = ? WHERE id = ?', [i, Number(order[i])]);
    }
    res.json({ message: 'Reordered.' });
  } catch (err) { next(err); }
});

// PATCH /api/offers/bulk-toggle
router.patch('/bulk-toggle', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { ids, isActive } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(422).json({ message: 'ids required.' });
    const placeholders = ids.map(() => '?').join(',');
    await execute(`UPDATE offers SET is_active = ? WHERE id IN (${placeholders})`, [isActive ? 1 : 0, ...ids]);
    res.json({ message: 'Updated.' });
  } catch (err) { next(err); }
});

module.exports = router;
