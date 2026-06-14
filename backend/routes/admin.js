const express = require('express');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { param, body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query, execute } = require('../db/mysql');
const {
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUserById,
  listUsers,
  countUsers,
} = require('../db/users');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const auditLogger = require('../middleware/auditLogger');
const { classifyLifestyle } = require('../utils/classifyLifestyle');
const { uploadSpreadsheet } = require('../middleware/upload');

const router = express.Router();

let syncStatus = { running: false, done: false, phase: 'idle', total: 0, processed: 0, matched: 0, updated: 0, added: 0, skipped: 0, error: null, startedAt: null, finishedAt: null };
let stockImportStatus = { running: false, done: false, total: 0, updated: 0, inserted: 0, skipped: 0, error: null, startedAt: null, finishedAt: null };

function mapAuditLog(row) {
  return {
    _id: String(row.id),
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorEmail: row.actor_email,
    action: row.action,
    targetModel: row.target_model,
    targetId: row.target_id,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

router.get('/dashboard', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrdersRow,
      todayOrdersRow,
      pendingOrdersRow,
      totalRevenueRow,
      todayRevenueRow,
      lowStockRows,
      outOfStockRow,
      totalCustomersRow,
    ] = await Promise.all([
      query('SELECT COUNT(*) AS total FROM orders WHERE is_deleted = 0', []),
      query('SELECT COUNT(*) AS total FROM orders WHERE is_deleted = 0 AND created_at >= ?', [today]),
      query("SELECT COUNT(*) AS total FROM orders WHERE is_deleted = 0 AND status = 'placed'", []),
      query("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE is_deleted = 0 AND payment_status = 'paid'", []),
      query("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE is_deleted = 0 AND payment_status = 'paid' AND created_at >= ?", [today]),
      query(
        `SELECT p.id, p.name, p.price, p.stock, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.is_deleted = 0 AND p.is_active = 1 AND p.stock > 0 AND p.stock <= 5
         ORDER BY p.stock ASC, p.name ASC LIMIT 20`,
        []
      ),
      query('SELECT COUNT(*) AS total FROM products WHERE is_deleted = 0 AND is_active = 1 AND stock = 0', []),
      query("SELECT COUNT(*) AS total FROM users WHERE role = 'customer'", []),
    ]);

    res.json({
      totalOrders: Number(totalOrdersRow[0]?.total || 0),
      todayOrders: Number(todayOrdersRow[0]?.total || 0),
      pendingOrders: Number(pendingOrdersRow[0]?.total || 0),
      totalRevenue: Number(totalRevenueRow[0]?.total || 0),
      todayRevenue: Number(todayRevenueRow[0]?.total || 0),
      lowStock: lowStockRows.map((row) => ({
        _id: String(row.id),
        name: row.name,
        price: Number(row.price || 0),
        stock: Number(row.stock || 0),
        category: row.category_id ? { _id: String(row.category_id), name: row.category_name, slug: row.category_slug } : null,
      })),
      outOfStock: Number(outOfStockRow[0]?.total || 0),
      totalCustomers: Number(totalCustomersRow[0]?.total || 0),
    });
  } catch (err) { next(err); }
});

router.get('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = String(req.query.search || '').trim();
    const [users, total] = await Promise.all([
      listUsers({ roles: ['customer'], search, limit, offset: (page - 1) * limit }),
      countUsers({ roles: ['customer'], search }),
    ]);
    res.json({ users: users.map((user) => user.toSafeObject()), total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
});

router.patch('/users/:id/ban', requireAuth, requireAdmin,
  [param('id').isInt({ min: 1 }), body('isBanned').isBoolean().toBoolean()],
  auditLogger('BAN_USER', 'User'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const user = await findUserById(req.params.id);
      if (!user || user.role !== 'customer') return res.status(404).json({ message: 'Customer not found.' });
      req._auditBefore = { isBanned: user.isBanned };
      user.isBanned = Boolean(req.body.isBanned);
      await updateUser(user);
      res.json({ message: `User ${user.isBanned ? 'banned' : 'unbanned'}.` });
    } catch (err) { next(err); }
  }
);

router.patch('/users/:id/role', requireAuth, requireSuperAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('role').isIn(['customer', 'admin', 'superadmin']).withMessage('Invalid role.'),
  ],
  auditLogger('CHANGE_ROLE', 'User'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
      if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ message: 'Cannot change your own role.' });
      }

      const user = await findUserById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      req._auditBefore = { role: user.role };
      user.role = req.body.role;
      if (req.body.role !== 'customer') user.emailVerified = true;
      const saved = await updateUser(user);
      res.json({ message: `Role changed to ${req.body.role}.`, user: saved.toSafeObject() });
    } catch (err) { next(err); }
  }
);

router.get('/admins', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const admins = await listUsers({ roles: ['admin', 'superadmin'], limit: 500, offset: 0 });
    res.json({ admins: admins.map((user) => user.toSafeObject()) });
  } catch (err) { next(err); }
});

router.post('/admins', requireAuth, requireSuperAdmin, [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
  body('phone').matches(/^\d{10}$/).withMessage('10-digit phone required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
  body('role').isIn(['admin', 'superadmin']).withMessage('Role must be admin or superadmin.'),
], auditLogger('CREATE_ADMIN', 'User'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg, errors: errors.array() });

    const existing = await findUserByEmail(req.body.email);
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS) || 12);
    const admin = await createUser({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      passwordHash,
      role: req.body.role,
      authProvider: 'local',
      emailVerified: true,
      addresses: [],
      familyMembers: [],
      isBanned: false,
    });
    res.status(201).json(admin.toSafeObject());
  } catch (err) { next(err); }
});

router.delete('/admins/:id', requireAuth, requireSuperAdmin,
  [param('id').isInt({ min: 1 })],
  auditLogger('DELETE_ADMIN', 'User'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
      if (String(req.params.id) === String(req.user._id)) {
        return res.status(400).json({ message: 'Cannot delete your own account.' });
      }

      const admin = await findUserById(req.params.id);
      if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
        return res.status(404).json({ message: 'Admin not found.' });
      }

      req._auditBefore = admin.toSafeObject();
      await deleteUserById(admin._id);
      res.json({ message: 'Admin account deleted.' });
    } catch (err) { next(err); }
  }
);

router.get('/audit-log', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const [rows, totalRows] = await Promise.all([
      query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, (page - 1) * limit]),
      query('SELECT COUNT(*) AS total FROM audit_logs', []),
    ]);
    res.json({ logs: rows.map(mapAuditLog), total: Number(totalRows[0]?.total || 0), page, pages: Math.ceil(Number(totalRows[0]?.total || 0) / limit) || 1 });
  } catch (err) { next(err); }
});

router.delete('/audit-log/clear', requireAuth, requireSuperAdmin,
  [body('password').notEmpty().withMessage('Password is required.')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });

      const me = await findUserById(req.user._id);
      const ok = await me.comparePassword(req.body.password);
      if (!ok) return res.status(401).json({ message: 'Incorrect password.' });

      const result = await execute('DELETE FROM audit_logs', []);
      res.json({ message: `${result.affectedRows} audit log entries deleted.`, deletedCount: result.affectedRows });
    } catch (err) { next(err); }
  }
);

router.delete('/orders/clear', requireAuth, requireSuperAdmin,
  [body('password').notEmpty().withMessage('Password is required.')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });

      const me = await findUserById(req.user._id);
      const ok = await me.comparePassword(req.body.password);
      if (!ok) return res.status(401).json({ message: 'Incorrect password.' });

      const result = await execute('DELETE FROM orders', []);
      res.json({ message: `${result.affectedRows} orders deleted.`, deletedCount: result.affectedRows });
    } catch (err) { next(err); }
  }
);

router.post('/sync-csv', requireAuth, requireSuperAdmin, async (req, res) => {
  if (syncStatus.running) {
    return res.status(409).json({ message: 'Sync already running.', status: syncStatus });
  }

  // Find data file — support CSV and Excel (.xlsx, .xls)
  const ROOT = path.join(__dirname, '..', '..');
  const candidates = [
    'paid_indian_medicine_data.xlsx',
    'paid_indian_medicine_data.csv',
    'medicine_data.xlsx',
    'medicine_data.csv',
  ].map(f => path.join(ROOT, f));

  const filePath = candidates.find(f => fs.existsSync(f));
  if (!filePath) {
    return res.status(503).json({
      message: 'Data file not found. Place paid_indian_medicine_data.csv or .xlsx in the project root directory.',
    });
  }

  syncStatus = { running: true, done: false, phase: 'reading', total: 0, processed: 0, matched: 0, updated: 0, added: 0, skipped: 0, error: null, startedAt: new Date().toISOString(), finishedAt: null };
  res.json({ message: 'Product sync started.', status: syncStatus });

  setImmediate(async () => {
    try {
      const wb = XLSX.readFile(filePath, { raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      // Build name → parsed-row map (keep last occurrence per name)
      const rowMap = new Map();
      for (const row of rawRows) {
        const rawName = String(row['name'] || row['Name'] || row['medicine_name'] || '').trim();
        if (rawName.length < 2) continue;
        rowMap.set(rawName.toLowerCase(), row);
      }

      const allKeys = [...rowMap.keys()];
      syncStatus.total = allKeys.length;
      syncStatus.phase = 'syncing';

      const BATCH = 500;

      for (let i = 0; i < allKeys.length; i += BATCH) {
        const keyBatch = allKeys.slice(i, i + BATCH);
        const placeholders = keyBatch.map(() => '?').join(',');

        // Fetch products in this name batch
        const existing = await query(
          `SELECT id, LOWER(name) AS name_key, price, description, brand, company, salt, pack, lifestyle_category
           FROM products WHERE LOWER(name) IN (${placeholders})`,
          keyBatch
        );
        const foundKeys = new Set(existing.map(r => r.name_key));

        // ── UPDATES ─────────────────────────────────────────────────────────
        for (const ex of existing) {
          const row = rowMap.get(ex.name_key);
          if (!row) { syncStatus.skipped++; continue; }

          const rawName  = String(row['name'] || row['Name'] || row['medicine_name'] || '').trim();
          const rawPrice = parseFloat(row['price'] || row['Price'] || row['mrp'] || 0);
          const rawDescr = String(row['medicine_desc'] || row['description'] || row['short_composition1'] || '').trim().slice(0, 2000);
          const rawComp  = String(row['manufacturer_name'] || row['manufacturer'] || '').trim().slice(0, 150);
          const rawPack  = String(row['pack_size_label'] || row['pack_size'] || '').trim().slice(0, 100);
          const rawSalt  = String(row['salt_composition'] || row['composition'] || '').trim().slice(0, 500);
          const price    = isNaN(rawPrice) || rawPrice <= 0 ? null : rawPrice;
          const newLifestyle = classifyLifestyle(rawName, rawComp, rawSalt);

          const updates = [];
          const vals    = [];

          if (price !== null && Math.abs(Number(ex.price) - price) > 0.01) {
            updates.push('price = ?'); vals.push(price);
          }
          if (rawDescr && !ex.description) {
            updates.push('description = ?'); vals.push(rawDescr);
          }
          if (rawComp && !ex.company) {
            updates.push('company = ?'); vals.push(rawComp);
          }
          if (!ex.brand && rawComp) {
            updates.push('brand = ?'); vals.push(rawComp);
          }
          if (rawSalt && !ex.salt) {
            updates.push('salt = ?'); vals.push(rawSalt);
          }
          if (rawPack && !ex.pack) {
            updates.push('pack = ?'); vals.push(rawPack);
          }
          // Always refresh lifestyle_category (fast indexed lookup)
          if (newLifestyle !== ex.lifestyle_category) {
            updates.push('lifestyle_category = ?'); vals.push(newLifestyle);
          }

          if (updates.length > 0) {
            vals.push(ex.id);
            await execute(`UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, vals);
            syncStatus.updated++;
          }
          syncStatus.matched++;
        }

        // ── INSERTS (names not in DB yet) ──────────────────────────────────
        const toInsert = keyBatch.filter(k => !foundKeys.has(k));
        for (const key of toInsert) {
          const row = rowMap.get(key);
          const rawName  = String(row['name'] || row['Name'] || row['medicine_name'] || '').trim();
          const rawPrice = parseFloat(row['price'] || row['Price'] || row['mrp'] || 0);
          const rawDescr = String(row['medicine_desc'] || row['description'] || row['short_composition1'] || '').trim().slice(0, 2000);
          const rawComp  = String(row['manufacturer_name'] || row['manufacturer'] || '').trim().slice(0, 150);
          const rawPack  = String(row['pack_size_label'] || row['pack_size'] || '').trim().slice(0, 100);
          const rawSalt  = String(row['salt_composition'] || row['composition'] || '').trim().slice(0, 500);
          const price    = isNaN(rawPrice) || rawPrice <= 0 ? 0 : rawPrice;
          const lifestyle = classifyLifestyle(rawName, rawComp, rawSalt);

          const slugBase = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
          const desc = rawDescr || rawSalt || rawComp || '';

          // Need a valid category_id — use the first available one
          const cats = await query('SELECT id FROM categories ORDER BY id ASC LIMIT 1', []);
          const catId = cats.length ? cats[0].id : 1;

          try {
            await execute(
              `INSERT INTO products (name, slug, category_id, price, mrp, description, brand, company, salt, pack, stock, is_active, lifestyle_category, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW())`,
              [rawName, slug, catId, price, price, desc, rawComp, rawComp, rawSalt, rawPack, lifestyle]
            );
            syncStatus.added++;
          } catch {
            // Slug collision — retry with timestamp suffix
            try {
              const slug2 = `${slugBase}-${Date.now().toString(36)}`;
              await execute(
                `INSERT INTO products (name, slug, category_id, price, mrp, description, brand, company, salt, pack, stock, is_active, lifestyle_category, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW())`,
                [rawName, slug2, catId, price, price, desc, rawComp, rawComp, rawSalt, rawPack, lifestyle]
              );
              syncStatus.added++;
            } catch {
              syncStatus.skipped++;
            }
          }
        }

        syncStatus.processed = Math.min(i + BATCH, allKeys.length);
      }

      syncStatus.running    = false;
      syncStatus.done       = true;
      syncStatus.phase      = 'complete';
      syncStatus.finishedAt = new Date().toISOString();
    } catch (err) {
      syncStatus.running    = false;
      syncStatus.done       = true;
      syncStatus.phase      = 'error';
      syncStatus.error      = err.message;
      syncStatus.finishedAt = new Date().toISOString();
    }
  });
});

router.get('/sync-csv/status', requireAuth, requireAdmin, async (req, res) => {
  res.json(syncStatus);
});

// ── GET /admin/export/orders — Excel export of all orders ────────────────────
router.get('/export/orders', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.id, o.total, o.status, o.payment_status, o.created_at,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              o.address_json, o.coupon_code, o.discount, o.delivery_charge, o.notes
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.is_deleted = 0
       ORDER BY o.created_at DESC LIMIT 50000`,
      []
    );
    const sheetData = [
      ['Order ID','Customer','Email','Phone','Total','Status','Payment','Coupon','Discount','Delivery Charge','Notes','Address','Created At'],
      ...rows.map(r => {
        let addr = '';
        try { const a = JSON.parse(r.address_json || '{}'); addr = [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', '); } catch {}
        return [
          r.id, r.user_name || '', r.user_email || '', r.user_phone || '',
          Number(r.total), r.status, r.payment_status, r.coupon_code || '',
          Number(r.discount || 0), Number(r.delivery_charge || 0), r.notes || '',
          addr, r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ── Availability Requests ────────────────────────────────────────────────────
router.get('/availability-requests', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status || '';

    let where = '1=1';
    const params = [];
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [rows, totalRows] = await Promise.all([
      query(
        `SELECT * FROM availability_requests WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      ),
      query(`SELECT COUNT(*) AS total FROM availability_requests WHERE ${where}`, params),
    ]);

    const total = Number(totalRows[0]?.total || 0);
    res.json({
      requests: rows.map(r => ({
        _id: String(r.id),
        medicineName: r.medicine_name,
        customerName: r.customer_name,
        phone: r.phone,
        email: r.email,
        searchQuery: r.search_query,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) { next(err); }
});

router.patch('/availability-requests/:id/status', requireAuth, requireAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['pending', 'reviewed', 'fulfilled', 'rejected']).withMessage('Invalid status.'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });

      const result = await execute(
        'UPDATE availability_requests SET status = ?, updated_at = NOW() WHERE id = ?',
        [req.body.status, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Request not found.' });
      res.json({ message: `Status updated to ${req.body.status}.` });
    } catch (err) { next(err); }
  }
);

router.delete('/availability-requests/:id', requireAuth, requireAdmin,
  [param('id').isInt({ min: 1 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const result = await execute('DELETE FROM availability_requests WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Request not found.' });
      res.json({ message: 'Request deleted.' });
    } catch (err) { next(err); }
  }
);

// ── Stock Import from Excel ──────────────────────────────────────────────────
router.post('/import-stock', requireAuth, requireAdmin, uploadSpreadsheet.single('file'), async (req, res) => {
  if (stockImportStatus.running) {
    return res.status(409).json({ message: 'Stock import already running.', status: stockImportStatus });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Upload an Excel (.xlsx/.xls) or CSV file.' });
  }

  stockImportStatus = { running: true, done: false, total: 0, updated: 0, inserted: 0, skipped: 0, error: null, startedAt: new Date().toISOString(), finishedAt: null };
  res.json({ message: 'Stock import started.', status: stockImportStatus });

  setImmediate(async () => {
    try {
      const wb = XLSX.read(req.file.buffer, { raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      // ── Parse items ──────────────────────────────────────────────
      let currentCompany = '';
      const items = [];

      // Find the header row offset (look for "Item Name" or "Barcode")
      let startIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const vals = Object.values(rows[i]).map(v => String(v).trim().toLowerCase());
        if (vals.includes('item name') || vals.includes('barcode')) {
          startIdx = i + 1; // skip past sub-header row too
          // Check if next row is also a header (Batch/Date/Expiry sub-header)
          if (startIdx < rows.length) {
            const nextVals = Object.values(rows[startIdx]).map(v => String(v).trim().toLowerCase());
            if (nextVals.includes('batch') || nextVals.includes('expiry')) {
              startIdx++;
            }
          }
          break;
        }
      }
      if (startIdx === 0) startIdx = 5; // fallback

      const cols = Object.keys(rows[0] || {});

      for (const r of rows.slice(startIdx)) {
        const col0 = String(r[cols[0]] || '').trim();
        const name = String(r[cols[1]] || '').trim();

        // Company header row
        if (col0.startsWith('Company')) {
          currentCompany = col0.replace(/^Company\s*:\s*/i, '').trim();
          continue;
        }

        // Skip non-item rows (totals, blanks, summary)
        if (!name || name.length < 2) continue;
        if (/^(total|grand total|sub total)/i.test(name)) continue;

        const qty   = parseInt(r[cols[4]]) || 0;
        const rate  = parseFloat(r[cols[7]]) || 0;
        const pack  = String(r[cols[3]] || '').trim();
        const unit  = String(r[cols[2]] || '').trim();
        const barcode = /^\d+$/.test(col0) ? col0 : '';

        items.push({
          name,
          company: currentCompany,
          stock: qty > 0 ? qty : 0,
          price: rate > 0 ? rate : 0,
          pack: pack || (unit ? String(unit) : ''),
          code: barcode,
        });
      }

      stockImportStatus.total = items.length;

      // ── Get default category ─────────────────────────────────────
      const cats = await query('SELECT id FROM categories ORDER BY id ASC LIMIT 1');
      const defaultCatId = cats.length ? cats[0].id : 1;

      // ── Build name lookup ────────────────────────────────────────
      const existingRows = await query(
        'SELECT id, LOWER(name) AS name_key, price, stock FROM products WHERE is_deleted = 0'
      );
      const existingMap = new Map();
      for (const row of existingRows) {
        existingMap.set(row.name_key, row);
      }

      // ── Process items ────────────────────────────────────────────
      for (const item of items) {
        const nameKey = item.name.toLowerCase();
        const existing = existingMap.get(nameKey);

        if (existing) {
          const updates = [];
          const vals = [];

          if (existing.stock !== item.stock) {
            updates.push('stock = ?');
            vals.push(item.stock);
          }
          if (item.price > 0 && Math.abs(Number(existing.price) - item.price) > 0.01) {
            updates.push('price = ?', 'mrp = ?');
            vals.push(item.price, item.price);
          }
          if (item.company && !existing.company) {
            updates.push('company = ?', 'brand = ?');
            vals.push(item.company, item.company);
          }

          if (updates.length > 0) {
            vals.push(existing.id);
            await execute(
              `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
              vals
            );
            stockImportStatus.updated++;
          } else {
            stockImportStatus.skipped++;
          }
        } else {
          const slugBase = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
          try {
            await execute(
              `INSERT INTO products
                (code, name, slug, category_id, brand, company, pack, mrp, price, stock, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
              [item.code, item.name, slug, defaultCatId, item.company, item.company, item.pack, item.price, item.price, item.stock]
            );
            stockImportStatus.inserted++;
          } catch {
            try {
              const slug2 = `${slugBase}-${Date.now().toString(36)}`;
              await execute(
                `INSERT INTO products
                  (code, name, slug, category_id, brand, company, pack, mrp, price, stock, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                [item.code, item.name, slug2, defaultCatId, item.company, item.company, item.pack, item.price, item.price, item.stock]
              );
              stockImportStatus.inserted++;
            } catch {
              stockImportStatus.skipped++;
            }
          }
          existingMap.set(nameKey, { id: -1, name_key: nameKey, price: item.price, stock: item.stock });
        }
      }

      stockImportStatus.running = false;
      stockImportStatus.done = true;
      stockImportStatus.finishedAt = new Date().toISOString();
    } catch (err) {
      stockImportStatus.running = false;
      stockImportStatus.done = true;
      stockImportStatus.error = err.message;
      stockImportStatus.finishedAt = new Date().toISOString();
    }
  });
});

router.get('/import-stock/status', requireAuth, requireAdmin, (req, res) => {
  res.json(stockImportStatus);
});

module.exports = router;