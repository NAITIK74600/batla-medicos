const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { query: queryValidator, param, body, validationResult } = require('express-validator');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const upload       = require('../middleware/upload');
const { query, execute } = require('../db/mysql');
const { findUserById } = require('../db/users');
const { sendPrescriptionUpdate } = require('../utils/mailer');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
let _hasAddressJsonColumn = null;

async function hasAddressJsonColumn() {
  if (_hasAddressJsonColumn !== null) return _hasAddressJsonColumn;
  try {
    const cols = await query("SHOW COLUMNS FROM prescriptions LIKE 'address_json'");
    _hasAddressJsonColumn = Array.isArray(cols) && cols.length > 0;
  } catch {
    _hasAddressJsonColumn = false;
  }
  return _hasAddressJsonColumn;
}

const uploadPrescriptionFile = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'prescription', maxCount: 1 },
]);

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

function mapPrescription(row) {
  let address = null;
  try {
    if (row.address_json) address = typeof row.address_json === 'string' ? JSON.parse(row.address_json) : row.address_json;
  } catch (e) { /* ignore */ }

  return {
    _id: String(row.id),
    user: row.user_id ? { _id: String(row.user_id), name: row.user_name || '', email: row.user_email || '', phone: row.user_phone || '' } : null,
    imageUrl: row.image_url,
    status: row.status,
    patientName: row.patient_name || '',
    doctorName: row.doctor_name || '',
    notes: row.notes || '',
    address,
    adminNote: row.admin_notes || '',
    // Back-compat (some older clients used adminNotes)
    adminNotes: row.admin_notes || '',
    usedInOrders: String(row.used_order_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/prescriptions — upload a prescription
router.post('/', requireAuth, uploadPrescriptionFile, async (req, res, next) => {
  try {
    const f = req.files?.file?.[0] || req.files?.prescription?.[0] || req.file;
    if (!f) return res.status(422).json({ message: 'No file uploaded.' });

    const patientName = String(req.body.patientName || '').trim().slice(0, 100);
    const doctorName = String(req.body.doctorName || '').trim().slice(0, 100);
    const notes = String(req.body.notes || '').trim().slice(0, 2000);
    
    let addressJson = null;
    if (req.body.address) {
      try {
        // If it comes as a stringified JSON
        const parsed = JSON.parse(req.body.address);
        if (typeof parsed === 'object' && parsed !== null) {
            addressJson = JSON.stringify(parsed);
        }
      } catch (e) {
         // ignore invalid json
      }
    }

    const url = saveFile(f.buffer, 'prescriptions', f.originalname);
    const includeAddress = await hasAddressJsonColumn();
    const result = includeAddress
      ? await execute(
        'INSERT INTO prescriptions (user_id, image_url, patient_name, doctor_name, notes, address_json) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, url, patientName || null, doctorName || null, notes || null, addressJson]
      )
      : await execute(
        'INSERT INTO prescriptions (user_id, image_url, patient_name, doctor_name, notes) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, url, patientName || null, doctorName || null, notes || null]
      );

    res.status(201).json({
      _id: String(result.insertId),
      imageUrl: url,
      status: 'pending',
      patientName,
      doctorName,
      notes,
      address: addressJson ? JSON.parse(addressJson) : null,
      adminNote: '',
      usedInOrders: [],
    });
  } catch (err) { next(err); }
});

// GET /api/prescriptions/my — customer's prescriptions
router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const includeAddress = await hasAddressJsonColumn();
    const rows = await query(
      `SELECT p.id, p.user_id, p.image_url, p.status, p.patient_name, p.doctor_name, p.notes, p.admin_notes, p.created_at, p.updated_at,
        ${includeAddress ? 'p.address_json' : 'NULL AS address_json'},
        (
          SELECT GROUP_CONCAT(o.id)
          FROM orders o
          WHERE o.prescription_url = p.image_url AND o.user_id = p.user_id AND o.is_deleted = 0
        ) AS used_order_ids
       FROM prescriptions p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const prescriptions = rows.map(r => mapPrescription({
      ...r,
      user_name: req.user.name,
      user_email: req.user.email,
      user_phone: req.user.phone,
    }));
    res.json({ prescriptions });
  } catch (err) { next(err); }
});

// GET /api/prescriptions — admin: all prescriptions
router.get('/', requireAuth, requireAdmin, [
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  queryValidator('status').optional().trim(),
], async (req, res, next) => {
  try {
    const includeAddress = await hasAddressJsonColumn();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    let whereSql = '';
    const vals = [];
    if (statusFilter) {
      whereSql = 'WHERE p.status = ?';
      vals.push(statusFilter);
    }

    const [rows, countRows] = await Promise.all([
      query(
        `SELECT p.id, p.user_id, p.image_url, p.status, p.patient_name, p.doctor_name, p.notes, p.admin_notes, p.created_at, p.updated_at,
          ${includeAddress ? 'p.address_json' : 'NULL AS address_json'},
          u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
          (
            SELECT GROUP_CONCAT(o.id)
            FROM orders o
            WHERE o.prescription_url = p.image_url AND o.user_id = p.user_id AND o.is_deleted = 0
          ) AS used_order_ids
         FROM prescriptions p
         LEFT JOIN users u ON u.id = p.user_id
         ${whereSql}
         ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM prescriptions p ${whereSql}`, vals),
    ]);
    const total = Number(countRows[0]?.total || 0);
    res.json({
      prescriptions: rows.map(mapPrescription),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// PATCH /api/prescriptions/:id — admin update status
router.patch('/:id', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const status = req.body.status;
    const adminNote = req.body.adminNote !== undefined
      ? req.body.adminNote
      : req.body.adminNotes;

    const sets = [];
    const vals = [];
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (adminNote !== undefined) { sets.push('admin_notes = ?'); vals.push(adminNote); }
    if (!sets.length) return res.status(422).json({ message: 'Nothing to update.' });
    vals.push(req.params.id);
    await execute(`UPDATE prescriptions SET ${sets.join(', ')} WHERE id = ?`, vals);

    // Send email on approval/rejection
    if (status === 'approved' || status === 'rejected') {
      try {
        const rxRows = await query(
          'SELECT p.user_id, u.email, u.name FROM prescriptions p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?',
          [req.params.id]
        );
        if (rxRows[0]?.email) {
          await sendPrescriptionUpdate(rxRows[0].email, rxRows[0].name, req.params.id, status, adminNote || '');
        }
      } catch (emailErr) { console.error('[mailer] prescription status email failed:', emailErr.message); }
    }

    res.json({ message: 'Prescription updated.' });
  } catch (err) { next(err); }
});

// POST /api/prescriptions/:id/create-order — admin places an order for the user, tied to this prescription
router.post(
  '/:id/create-order',
  requireAuth,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const includeAddress = await hasAddressJsonColumn();
      const rxRows = await query(
        `SELECT p.*, ${includeAddress ? 'p.address_json' : 'NULL AS address_json'}, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
         FROM prescriptions p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.id = ? LIMIT 1`,
        [req.params.id]
      );
      if (!rxRows.length) return res.status(404).json({ message: 'Prescription not found.' });
      const rx = rxRows[0];
      
      // If address is not provided in body, try to use prescription address
      let address = req.body.address;
      if (!address && rx.address_json) {
         try {
             address = typeof rx.address_json === 'string' ? JSON.parse(rx.address_json) : rx.address_json;
         } catch(e) {}
      }

      if (rx.status !== 'approved') {
        return res.status(422).json({ message: 'Prescription must be approved before creating an order.' });
      }

      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(422).json({ message: 'At least one item is required.' });

      if (!address || typeof address !== 'object') return res.status(422).json({ message: 'Address is required (either in request or in prescription).' });
      const line1 = String(address.line1 || '').trim();
      const line2 = String(address.line2 || '').trim();
      const city = String(address.city || '').trim();
      const pincode = String(address.pincode || '').trim();
      const phone = String(address.phone || '').trim();
      if (line1.length < 5) return res.status(422).json({ message: 'Address line1 is required.' });
      if (city.length < 2) return res.status(422).json({ message: 'City is required.' });
      if (!/^\d{6}$/.test(pincode)) return res.status(422).json({ message: '6-digit pincode is required.' });
      if (!/^\d{10}$/.test(phone)) return res.status(422).json({ message: '10-digit phone is required.' });

      // Fetch product details and compute totals
      let total = 0;
      const orderItems = [];

      for (const item of items) {
        const productId = Number(item.productId || item.product || item._id);
        const qty = Number(item.qty || 1);
        if (!Number.isFinite(productId) || productId <= 0) {
          return res.status(422).json({ message: 'Invalid productId in items.' });
        }
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
          return res.status(422).json({ message: 'Invalid qty in items.' });
        }

        const prodRows = await query(
          'SELECT id, name, price, is_deleted, is_active FROM products WHERE id = ? LIMIT 1',
          [productId]
        );
        const p = prodRows[0];
        if (!p || Number(p.is_deleted) === 1 || Number(p.is_active) === 0) {
          return res.status(404).json({ message: 'Product not found or inactive.' });
        }

        const price = Number(p.price || 0);
        total += price * qty;
        orderItems.push({ product_id: p.id, name: String(p.name || '').slice(0, 200), price, qty });
      }

      const otp = String(Math.floor(1000 + Math.random() * 9000));
      const addressPayload = { line1, line2, city, pincode, phone };

      const result = await execute(
        `INSERT INTO orders (user_id, total, status, payment_status, address_json, notes, prescription_url, delivery_otp)
         VALUES (?, ?, 'placed', 'cod', ?, ?, ?, ?)`,
        [
          rx.user_id,
          total,
          JSON.stringify(addressPayload),
          `Created by admin from prescription #${rx.id}`,
          rx.image_url,
          otp,
        ]
      );
      const orderId = result.insertId;

      for (const item of orderItems) {
        await execute(
          'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.product_id, item.name, item.price, item.qty]
        );
      }

      res.status(201).json({ orderId: String(orderId) });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — export prescriptions as XLSX
// GET /api/prescriptions/export
// ─────────────────────────────────────────────────────────────────────────────
router.get('/export', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status || '';
    const conditions = ['1=1'];
    const params = [];
    if (status) { conditions.push('p.status = ?'); params.push(status); }
    const rows = await query(
      `SELECT p.id, p.patient_name, p.doctor_name, p.notes, p.status, p.admin_notes,
              p.image_url, p.created_at,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM prescriptions p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT 10000`,
      params
    );
    const sheetData = [
      ['ID','Patient Name','Doctor Name','Customer Name','Email','Phone','Status','Admin Notes','Notes','Image URL','Created At'],
      ...rows.map(r => [r.id, r.patient_name||'', r.doctor_name||'', r.user_name||'', r.user_email||'', r.user_phone||'',
                        r.status, r.admin_notes||'', r.notes||'', r.image_url||'',
                        r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch:6 },{ wch:20 },{ wch:20 },{ wch:20 },{ wch:28 },{ wch:14 },{ wch:12 },{ wch:30 },{ wch:30 },{ wch:50 },{ wch:18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prescriptions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `prescriptions-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN — clear prescriptions
// DELETE /api/prescriptions/clear
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/clear', requireAuth, requireSuperAdmin,
  [body('password').notEmpty().withMessage('Password is required.')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
      const me = await findUserById(req.user._id);
      const ok = await me.comparePassword(req.body.password);
      if (!ok) return res.status(401).json({ message: 'Incorrect password.' });
      const result = await execute('DELETE FROM prescriptions', []);
      res.json({ message: `${result.affectedRows} prescriptions deleted.`, deletedCount: result.affectedRows });
    } catch (err) { next(err); }
  }
);

// DELETE /api/prescriptions/:id
router.delete('/:id', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    // Customers can only delete their own
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const rows = await query('SELECT id FROM prescriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!rows.length) return res.status(403).json({ message: 'Not authorized.' });
    }
    await execute('DELETE FROM prescriptions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Prescription deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
