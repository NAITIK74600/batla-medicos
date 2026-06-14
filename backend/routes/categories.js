const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query, execute } = require('../db/mysql');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const slugify = require('../utils/slugify');

const router = express.Router();

function mapCategory(row) {
  return {
    _id: String(row.id),
    name: row.name,
    slug: row.slug,
    icon: row.icon || '',
    order: row.ord || 0,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.*, COALESCE(pc.cnt, 0) AS product_count
       FROM categories c
       LEFT JOIN (
         SELECT category_id, COUNT(*) AS cnt FROM products WHERE is_deleted = 0 GROUP BY category_id
       ) pc ON pc.category_id = c.id
       WHERE c.is_deleted = 0
       ORDER BY c.ord ASC, c.name ASC`,
      []
    );
    res.json({ categories: rows.map(r => ({ ...mapCategory(r), productCount: Number(r.product_count) })) });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireAdmin, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('icon').optional().trim(),
  body('order').optional().isInt({ min: 0 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const slug = slugify(req.body.name);
    const existing = await query('SELECT id FROM categories WHERE slug = ? LIMIT 1', [slug]);
    if (existing.length) return res.status(409).json({ message: 'Category already exists.' });

    const result = await execute(
      'INSERT INTO categories (name, slug, icon, ord, is_deleted) VALUES (?, ?, ?, ?, 0)',
      [req.body.name.trim(), slug, req.body.icon || '', Number(req.body.order || 0)]
    );
    const rows = await query('SELECT * FROM categories WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(mapCategory(rows[0]));
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireAdmin, [
  param('id').isInt({ min: 1 }),
  body('name').optional().trim().isLength({ min: 1, max: 150 }),
  body('icon').optional().trim().isLength({ max: 255 }),
  body('order').optional().isInt({ min: 0 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM categories WHERE id = ? AND is_deleted = 0 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Category not found.' });

    const current = rows[0];
    const nextName = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    const nextSlug = req.body.name ? slugify(req.body.name) : current.slug;

    // Return 409 instead of raw DB 500 on slug collision
    if (nextSlug !== current.slug) {
      const collision = await query(
        'SELECT id FROM categories WHERE slug = ? AND id <> ? LIMIT 1',
        [nextSlug, req.params.id]
      );
      if (collision.length) return res.status(409).json({ message: 'A category with that name already exists.' });
    }

    await execute(
      'UPDATE categories SET name = ?, slug = ?, icon = ?, ord = ? WHERE id = ?',
      [
        nextName,
        nextSlug,
        req.body.icon !== undefined ? req.body.icon : current.icon,
        req.body.order !== undefined ? Number(req.body.order || 0) : current.ord,
        req.params.id,
      ]
    );

    const updated = await query('SELECT * FROM categories WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapCategory(updated[0]));
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    // Prevent orphaning products: block delete if any non-deleted products are assigned here
    const [countRow] = await query(
      'SELECT COUNT(*) AS cnt FROM products WHERE category_id = ? AND is_deleted = 0',
      [req.params.id]
    );
    const productCount = Number(countRow?.cnt || 0);
    if (productCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${productCount} product(s) are assigned to this category. Reassign them first.`,
      });
    }

    const result = await execute('UPDATE categories SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Category not found.' });
    res.json({ message: 'Category deleted.' });
  } catch (err) { next(err); }
});

// PUT /categories/:id/reassign  — move all products from this category to targetId before delete
router.put('/:id/reassign', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ message: 'targetId is required.' });

    const [targetRow] = await query(
      'SELECT id FROM categories WHERE id = ? AND is_deleted = 0 LIMIT 1', [targetId]
    );
    if (!targetRow) return res.status(404).json({ message: 'Target category not found.' });

    await execute(
      'UPDATE products SET category_id = ? WHERE category_id = ? AND is_deleted = 0',
      [targetId, req.params.id]
    );
    res.json({ message: 'Products reassigned.' });
  } catch (err) { next(err); }
});

module.exports = router;
