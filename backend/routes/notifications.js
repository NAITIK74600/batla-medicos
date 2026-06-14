const express = require('express');
const { query: queryValidator, param, validationResult } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { query, execute } = require('../db/mysql');

const router = express.Router();

// GET /api/notifications — customer notifications
router.get('/', requireAuth, [
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      query(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [req.user.id, limit, offset]
      ),
      query('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?', [req.user.id]),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const unread = await query('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);

    res.json({
      notifications: rows.map(mapNotif),
      total,
      unread: Number(unread[0]?.cnt || 0),
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// GET /api/notifications/admin — admin notifications
router.get('/admin', requireAuth, requireAdmin, [
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      query(
        `SELECT * FROM notifications WHERE is_admin = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      query('SELECT COUNT(*) AS total FROM notifications WHERE is_admin = 1', []),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const unread = await query('SELECT COUNT(*) AS cnt FROM notifications WHERE is_admin = 1 AND is_read = 0', []);

    res.json({
      notifications: rows.map(mapNotif),
      total,
      unread: Number(unread[0]?.cnt || 0),
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let result;
    if (isAdmin) {
      // Admins can only mark admin notifications as read
      result = await execute(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND is_admin = 1',
        [req.params.id]
      );
    } else {
      // Customers can only mark their own notifications as read
      result = await execute(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );
    }
    if (result.affectedRows === 0) return res.status(403).json({ message: 'Not authorized.' });
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      await execute('UPDATE notifications SET is_read = 1 WHERE is_admin = 1 AND is_read = 0', []);
    } else {
      await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
    }
    res.json({ message: 'All marked as read.' });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete('/:id', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let result;
    if (isAdmin) {
      result = await execute(
        'DELETE FROM notifications WHERE id = ? AND is_admin = 1',
        [req.params.id]
      );
    } else {
      result = await execute(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );
    }
    if (result.affectedRows === 0) return res.status(403).json({ message: 'Not authorized.' });
    res.json({ message: 'Notification deleted.' });
  } catch (err) { next(err); }
});

function mapNotif(row) {
  return {
    _id: String(row.id),
    user: row.user_id ? String(row.user_id) : null,
    type: row.type,
    title: row.title,
    message: row.message || '',
    isRead: Boolean(row.is_read),
    isAdmin: Boolean(row.is_admin),
    link: row.link || '',
    createdAt: row.created_at,
  };
}

module.exports = router;
