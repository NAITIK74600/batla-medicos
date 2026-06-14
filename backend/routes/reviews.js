const express = require('express');
const { body, query: queryValidator, param, validationResult } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { query, execute } = require('../db/mysql');

const router = express.Router();

// GET /api/reviews/product/:productId
router.get('/product/:productId', [
  param('productId').isInt({ min: 1 }),
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const productId = Number(req.params.productId);
    const page = Number(req.query.page || 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const [rows, countRows, statsRows] = await Promise.all([
      query(
        `SELECT r.*, u.name AS user_name
         FROM reviews r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.product_id = ?
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        [productId, limit, offset]
      ),
      query('SELECT COUNT(*) AS total FROM reviews WHERE product_id = ?', [productId]),
      query('SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE product_id = ?', [productId]),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const avgRating = Number(Number(statsRows[0]?.avg_rating || 0).toFixed(1));
    const ratingCount = Number(statsRows[0]?.cnt || 0);

    res.json({
      reviews: rows.map(r => ({
        _id: String(r.id),
        user: { _id: String(r.user_id), name: r.user_name || 'Customer' },
        rating: r.rating,
        comment: r.comment || '',
        createdAt: r.created_at,
      })),
      total,
      avgRating,
      ratingCount,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// POST /api/reviews — submit a review
router.post('/', requireAuth, [
  body('productId').isInt({ min: 1 }),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim().isLength({ max: 500 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { productId, rating, comment } = req.body;

    // Check if user already reviewed this product
    const existing = await query(
      'SELECT id FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1',
      [productId, req.user.id]
    );
    if (existing.length) {
      // Update existing review
      await execute(
        'UPDATE reviews SET rating = ?, comment = ? WHERE id = ?',
        [rating, comment || '', existing[0].id]
      );
      return res.json({ message: 'Review updated.' });
    }

    await execute(
      'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
      [productId, req.user.id, rating, comment || '']
    );
    res.status(201).json({ message: 'Review submitted.' });
  } catch (err) { next(err); }
});

// DELETE /api/reviews/:id — admin delete
router.delete('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    await execute('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    res.json({ message: 'Review deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
