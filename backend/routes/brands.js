'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const requireAuth   = require('../middleware/requireAuth');
const requireAdmin  = require('../middleware/requireAdmin');
const upload        = require('../middleware/upload');
const { query, execute } = require('../db/mysql');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveFile(buffer, subfolder, originalName) {
  const dir = path.join(UPLOADS_DIR, subfolder);
  ensureDir(dir);
  const ext = path.extname(originalName || '.jpg').toLowerCase();
  const name = crypto.randomBytes(16).toString('hex') + ext;
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${subfolder}/${name}`;
}

function deleteLocalFile(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '..', urlPath);
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

function mapBrand(row) {
  let media = [];
  if (row.media_json) {
    try { media = typeof row.media_json === 'string' ? JSON.parse(row.media_json) : row.media_json; } catch { media = []; }
  }
  return {
    _id:      String(row.id),
    name:     row.name,
    slug:     row.slug,
    logoUrl:  row.logo_url || null,
    gradient: row.gradient || '',
    category: row.category,
    ord:      Number(row.ord || 0),
    isActive: Boolean(row.is_active),
    media,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(str) {
  return String(str || '').trim().toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}



// ── Public: get all active brands (optionally filtered by category) ──────────
router.get('/', async (req, res, next) => {
  try {
    const cat = req.query.category;
    let sql = 'SELECT * FROM brands WHERE is_active = 1';
    const vals = [];
    if (cat && ['featured', 'ayurvedic', 'general', 'personal_care'].includes(cat)) {
      sql += ' AND category = ?';
      vals.push(cat);
    }
    sql += ' ORDER BY ord ASC, name ASC';
    const rows = await query(sql, vals);
    res.json({ brands: rows.map(mapBrand) });
  } catch (err) { next(err); }
});

// ── Admin: get all brands (including inactive) ────────────────────────────────
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM brands ORDER BY ord ASC, name ASC', []);
    res.json({ brands: rows.map(mapBrand) });
  } catch (err) { next(err); }
});

// ── Public: brand promotion videos ──────────────────────────────────────────
// GET /brands/promotions?display=home|brand   → videos set for that location
// GET /brands/promotions?brand=slug           → limit to a specific brand
router.get('/promotions', async (req, res, next) => {
  try {
    const display   = req.query.display;  // 'home' | 'brand' | undefined (all)
    const brandSlug = req.query.brand;    // optional slug filter

    let sql = 'SELECT * FROM brands WHERE is_active = 1';
    const vals = [];
    if (brandSlug) { sql += ' AND slug = ?'; vals.push(brandSlug); }
    sql += ' ORDER BY ord ASC, name ASC';

    const rows = await query(sql, vals);
    const promotions = [];
    for (const row of rows) {
      const b = mapBrand(row);
      const videos = b.media.filter(m => {
        if (m.type !== 'video') return false;
        if (!display) return true;
        const on = m.displayOn || 'both'; // default: show everywhere
        return on === display || on === 'both';
      });
      if (videos.length) {
        promotions.push({ brand: { _id: b._id, name: b.name, slug: b.slug, logoUrl: b.logoUrl }, videos });
      }
    }
    res.json({ promotions });
  } catch (err) { next(err); }
});

// ── Public: get single brand by slug or id ────────────────────────────────────
router.get('/:slugOrId', async (req, res, next) => {
  try {
    const val = req.params.slugOrId;
    const isId = /^\d+$/.test(val);
    const sql = isId
      ? 'SELECT * FROM brands WHERE id = ? LIMIT 1'
      : 'SELECT * FROM brands WHERE slug = ? LIMIT 1';
    const rows = await query(sql, [val]);
    if (!rows.length) return res.status(404).json({ message: 'Brand not found.' });
    res.json({ brand: mapBrand(rows[0]) });
  } catch (err) { next(err); }
});

// ── Admin: create brand ───────────────────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, upload.single('logo'), [
  body('name').trim().notEmpty().isLength({ max: 150 }),
  body('category').isIn(['featured', 'ayurvedic', 'general', 'personal_care']),
  body('ord').optional().isInt({ min: 0 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const slugBase = slugify(req.body.name);
    let slug = slugBase;
    let suffix = 2;
    while ((await query('SELECT id FROM brands WHERE slug = ? LIMIT 1', [slug])).length) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }

    let logoUrl = null;
    if (req.file) {
      logoUrl = saveFile(req.file.buffer, 'brands', req.file.originalname);
    } else if (req.body.logoUrl && /^https?:\/\//i.test(String(req.body.logoUrl))) {
      logoUrl = String(req.body.logoUrl).trim();
    }

    const gradient = req.body.gradient ? String(req.body.gradient).trim() : '';

    // Parse media array from JSON string
    let media = [];
    if (req.body.media) {
      try { media = JSON.parse(req.body.media); } catch { media = []; }
    }
    // Validate each entry: { type, url, title?, displayOn? }
    media = (Array.isArray(media) ? media : [])
      .filter(m => m && ['image', 'video'].includes(m.type) && typeof m.url === 'string' && (/^https?:\/\//i.test(m.url) || /^\/uploads\//i.test(m.url)))
      .map(m => {
        const entry = { type: m.type, url: m.url };
        if (m.title) entry.title = String(m.title).slice(0, 100);
        entry.displayOn = (m.displayOn && ['home', 'brand', 'both'].includes(m.displayOn)) ? m.displayOn : 'both';
        return entry;
      })
      .slice(0, 10);

    const result = await execute(
      `INSERT INTO brands (name, slug, logo_url, gradient, category, ord, is_active, media_json)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        req.body.name.trim(),
        slug,
        logoUrl,
        gradient,
        req.body.category,
        Number(req.body.ord || 0),
        media.length ? JSON.stringify(media) : null,
      ]
    );

    const rows = await query('SELECT * FROM brands WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(mapBrand(rows[0]));
  } catch (err) { next(err); }
});

// ── Admin: update brand ───────────────────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, upload.single('logo'), [
  param('id').isInt({ min: 1 }),
  body('name').optional().trim().isLength({ min: 1, max: 150 }),
  body('category').optional().isIn(['featured', 'ayurvedic', 'general', 'personal_care']),
  body('ord').optional().isInt({ min: 0 }).toInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM brands WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Brand not found.' });
    const current = rows[0];

    let logoUrl = current.logo_url;

    if (req.body.removeLogo === 'true' || req.body.removeLogo === true) {
      deleteLocalFile(logoUrl);
      logoUrl = null;
    } else if (req.file) {
      deleteLocalFile(logoUrl);
      logoUrl = saveFile(req.file.buffer, 'brands', req.file.originalname);
    } else if (req.body.logoUrl && /^https?:\/\//i.test(String(req.body.logoUrl))) {
      logoUrl = String(req.body.logoUrl).trim();
    }

    const nextName = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    let nextSlug = current.slug;
    if (nextName !== current.name) {
      const slugBase = slugify(nextName);
      nextSlug = slugBase;
      let suffix = 2;
      while ((await query('SELECT id FROM brands WHERE slug = ? AND id <> ? LIMIT 1', [nextSlug, req.params.id])).length) {
        nextSlug = `${slugBase}-${suffix}`;
        suffix += 1;
      }
    }

    // Parse media array
    let mediaJson = current.media_json;
    if (req.body.media !== undefined) {
      let media = [];
      try { media = JSON.parse(req.body.media); } catch { media = []; }
      media = (Array.isArray(media) ? media : [])
        .filter(m => m && ['image', 'video'].includes(m.type) && typeof m.url === 'string' && (/^https?:\/\//i.test(m.url) || /^\/uploads\//i.test(m.url)))
        .map(m => {
          const entry = { type: m.type, url: m.url };
          if (m.title) entry.title = String(m.title).slice(0, 100);
          entry.displayOn = (m.displayOn && ['home', 'brand', 'both'].includes(m.displayOn)) ? m.displayOn : 'both';
          return entry;
        })
        .slice(0, 10);
      mediaJson = media.length ? JSON.stringify(media) : null;
    }

    await execute(
      `UPDATE brands SET name = ?, slug = ?, logo_url = ?, gradient = ?, category = ?, ord = ?, is_active = ?, media_json = ? WHERE id = ?`,
      [
        nextName,
        nextSlug,
        logoUrl,
        req.body.gradient !== undefined ? String(req.body.gradient).trim() : (current.gradient || ''),
        req.body.category !== undefined ? req.body.category : current.category,
        req.body.ord !== undefined ? Number(req.body.ord) : current.ord,
        req.body.isActive !== undefined ? (req.body.isActive === 'true' || req.body.isActive === true ? 1 : 0) : current.is_active,
        mediaJson,
        req.params.id,
      ]
    );

    const updated = await query('SELECT * FROM brands WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapBrand(updated[0]));
  } catch (err) { next(err); }
});

// ── Admin: delete brand ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query('SELECT * FROM brands WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Brand not found.' });

    deleteLocalFile(rows[0].logo_url);

    await execute('DELETE FROM brands WHERE id = ?', [req.params.id]);
    res.json({ message: 'Brand deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
