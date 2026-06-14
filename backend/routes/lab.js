'use strict';
const express   = require('express');
const router    = express.Router();
const XLSX      = require('xlsx');
const { body, validationResult } = require('express-validator');
const bcrypt    = require('bcryptjs');
const { query, execute } = require('../db/mysql');
const requireAuth       = require('../middleware/requireAuth');
const requireAdmin      = require('../middleware/requireAdmin');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { findUserById }  = require('../db/users');
const { sendLabBookingConfirmation, sendLabStatusUpdate } = require('../utils/mailer');

// ── helpers ────────────────────────────────────────────────────────────────────
function mapTest(row) {
  if (!row) return null;
  return {
    _id:            row.id,
    name:           row.name,
    slug:           row.slug,
    category:       row.category,
    description:    row.description,
    sampleType:     row.sample_type,
    turnaroundTime: row.turnaround_time,
    parameters:     safeJson(row.parameters_json, []),
    mrp:            row.mrp != null ? Number(row.mrp) : null,
    price:          Number(row.price),
    homeCollection: Boolean(row.home_collection),
    isActive:       Boolean(row.is_active),
    createdAt:      row.created_at,
  };
}

function mapBooking(row) {
  if (!row) return null;
  return {
    _id:            row.id,
    userId:         row.user_id,
    testIds:        safeJson(row.test_ids_json, []),
    testSnapshots:  safeJson(row.test_snapshots_json, []),
    totalAmount:    Number(row.total_amount),
    patientName:    row.patient_name,
    patientAge:     row.patient_age,
    patientGender:  row.patient_gender,
    phone:          row.phone,
    collectionType: row.collection_type,
    address:        safeJson(row.address_json, {}),
    bookingDate:    row.booking_date,
    slot:           row.slot,
    status:         row.status,
    reportUrl:      row.report_url,
    createdAt:      row.created_at,
  };
}

function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — list tests
// GET /api/lab/tests?limit=&category=&search=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tests', async (req, res) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const page     = Math.max(parseInt(req.query.page   || '1',  10), 1);
    const offset   = (page - 1) * limit;
    const category = req.query.category || '';
    const search   = req.query.search   || '';

    const conditions = ['t.is_active = 1'];
    const params     = [];

    if (category) { conditions.push('t.category = ?'); params.push(category); }
    if (search)   { conditions.push('t.name LIKE ?');  params.push(`%${search}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM lab_tests t ${where}`, params);
    const rows = await query(`SELECT * FROM lab_tests t ${where} ORDER BY t.id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);

    res.json({ tests: rows.map(mapTest), total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
  } catch (err) {
    console.error('GET /lab/tests', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — list all tests (including inactive)
// GET /api/lab/tests/admin
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tests/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const page   = Math.max(parseInt(req.query.page  || '1',   10), 1);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const conditions = [];
    const params     = [];
    if (search) { conditions.push('name LIKE ?'); params.push(`%${search}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM lab_tests ${where}`, params);
    const rows = await query(`SELECT * FROM lab_tests ${where} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);

    res.json({ tests: rows.map(mapTest), total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
  } catch (err) {
    console.error('GET /lab/tests/admin', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — single test
// GET /api/lab/tests/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tests/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM lab_tests WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Test not found' });
    res.json({ test: mapTest(rows[0]) });
  } catch (err) {
    console.error('GET /lab/tests/:id', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — create test
// POST /api/lab/tests
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category = 'other', description = '', sampleType = 'Blood',
            turnaroundTime = '24 hrs', parameters = [], mrp, price = 0,
            homeCollection = true, isActive = true } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: 'name required' });
    if (!price || isNaN(Number(price))) return res.status(400).json({ message: 'valid price required' });

    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const existing = await query('SELECT id FROM lab_tests WHERE slug = ?', [slug]);
      if (!existing[0]) break;
      slug = `${baseSlug}-${suffix++}`;
    }

    const result = await execute(
      `INSERT INTO lab_tests (name, slug, category, description, sample_type, turnaround_time, parameters_json, mrp, price, home_collection, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), slug, category, description, sampleType, turnaroundTime,
       JSON.stringify(parameters), mrp != null ? Number(mrp) : null, Number(price), homeCollection ? 1 : 0, isActive ? 1 : 0]
    );

    const rows = await query('SELECT * FROM lab_tests WHERE id = ?', [result.insertId]);
    res.status(201).json({ test: mapTest(rows[0]) });
  } catch (err) {
    console.error('POST /lab/tests', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — update test
// PUT /api/lab/tests/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/tests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await query('SELECT * FROM lab_tests WHERE id = ?', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ message: 'Test not found' });

    const { name, category, description, sampleType, turnaroundTime,
            parameters, mrp, price, homeCollection, isActive } = req.body;

    const updates = [];
    const params  = [];

    if (name !== undefined)           { updates.push('name = ?');            params.push(name.trim()); }
    if (category !== undefined)       { updates.push('category = ?');        params.push(category); }
    if (description !== undefined)    { updates.push('description = ?');     params.push(description); }
    if (sampleType !== undefined)     { updates.push('sample_type = ?');     params.push(sampleType); }
    if (turnaroundTime !== undefined) { updates.push('turnaround_time = ?'); params.push(turnaroundTime); }
    if (parameters !== undefined)     { updates.push('parameters_json = ?'); params.push(JSON.stringify(parameters)); }
    if (mrp !== undefined)            { updates.push('mrp = ?');             params.push(mrp != null ? Number(mrp) : null); }
    if (price !== undefined)          { updates.push('price = ?');           params.push(Number(price)); }
    if (homeCollection !== undefined) { updates.push('home_collection = ?'); params.push(homeCollection ? 1 : 0); }
    if (isActive !== undefined)       { updates.push('is_active = ?');       params.push(isActive ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ message: 'Nothing to update' });

    params.push(req.params.id);
    await execute(`UPDATE lab_tests SET ${updates.join(', ')} WHERE id = ?`, params);
    const rows = await query('SELECT * FROM lab_tests WHERE id = ?', [req.params.id]);
    res.json({ test: mapTest(rows[0]) });
  } catch (err) {
    console.error('PUT /lab/tests/:id', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — delete test
// DELETE /api/lab/tests/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/tests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT id FROM lab_tests WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Test not found' });
    await execute('DELETE FROM lab_tests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /lab/tests/:id', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — create booking
// POST /api/lab/bookings
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bookings', requireAuth, async (req, res) => {
  try {
    const { tests: testIds = [], patientName, patientAge, patientGender = 'male',
            phone, collectionType = 'home', address = {}, bookingDate, slot } = req.body;

    if (!testIds.length)              return res.status(400).json({ message: 'Select at least one test' });
    if (!patientName?.trim())         return res.status(400).json({ message: 'Patient name required' });
    if (!/^\d{10}$/.test(phone))      return res.status(400).json({ message: 'Valid 10-digit phone required' });
    if (!bookingDate)                 return res.status(400).json({ message: 'Booking date required' });
    if (!slot)                        return res.status(400).json({ message: 'Time slot required' });

    const idList     = testIds.map(Number).filter(Boolean);
    const placeholders = idList.map(() => '?').join(',');
    const tests = await query(`SELECT * FROM lab_tests WHERE id IN (${placeholders}) AND is_active = 1`, idList);
    if (tests.length !== idList.length) return res.status(400).json({ message: 'One or more tests not found' });

    const snapshots    = tests.map(t => ({ name: t.name, price: Number(t.price) }));
    const totalAmount  = snapshots.reduce((s, t) => s + t.price, 0);

    const result = await execute(
      `INSERT INTO lab_bookings (user_id, test_ids_json, test_snapshots_json, total_amount, patient_name, patient_age, patient_gender, phone, collection_type, address_json, booking_date, slot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, JSON.stringify(idList), JSON.stringify(snapshots), totalAmount,
       patientName.trim(), patientAge ? Number(patientAge) : null, patientGender,
       phone, collectionType, JSON.stringify(address),
       bookingDate, slot]
    );

    const rows = await query('SELECT * FROM lab_bookings WHERE id = ?', [result.insertId]);

    // Send booking confirmation email
    try {
      const userRows = await query('SELECT email, name FROM users WHERE id = ?', [req.user.id]);
      if (userRows[0]?.email) {
        await sendLabBookingConfirmation(userRows[0].email, userRows[0].name, {
          _id: result.insertId, patientName: patientName.trim(), bookingDate, slot,
          collectionType, testSnapshots: snapshots, totalAmount,
        });
      }
    } catch (emailErr) { console.error('[mailer] lab booking confirmation failed:', emailErr.message); }

    res.status(201).json({ booking: mapBooking(rows[0]) });
  } catch (err) {
    console.error('POST /lab/bookings', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — my bookings
// GET /api/lab/bookings/my
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/my', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM lab_bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ bookings: rows.map(mapBooking) });
  } catch (err) {
    console.error('GET /lab/bookings/my', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — export lab bookings as XLSX
// GET /api/lab/bookings/export
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || '';
    const search = req.query.search || '';
    const dateF  = req.query.date   || '';
    const conditions = [];
    const params = [];
    if (status) { conditions.push('b.status = ?'); params.push(status); }
    if (search) { conditions.push('(b.patient_name LIKE ? OR b.phone LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (dateF)  { conditions.push('DATE(b.booking_date) = ?'); params.push(dateF); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = await query(
      `SELECT b.id, b.patient_name, b.patient_age, b.patient_gender, b.phone,
              b.collection_type, b.booking_date, b.slot, b.status,
              b.total_amount, b.test_snapshots_json, b.address_json,
              b.report_url, b.created_at,
              u.email AS user_email, u.name AS user_name
       FROM lab_bookings b
       LEFT JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT 10000`,
      params
    );

    const sheetData = [
      ['ID','Patient','Age','Gender','Phone','User Email','Collection','Booking Date','Slot','Status','Amount','Tests','Report URL','Created At'],
      ...rows.map(r => {
        const snaps = (() => { try { return JSON.parse(r.test_snapshots_json || '[]'); } catch { return []; } })();
        const testNames = snaps.map(s => s.name).join('; ');
        return [r.id, r.patient_name, r.patient_age, r.patient_gender, r.phone, r.user_email || '',
                r.collection_type, r.booking_date ? new Date(r.booking_date).toLocaleDateString('en-IN') : '',
                r.slot, r.status, Number(r.total_amount), testNames, r.report_url || '',
                r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : ''];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch:6 },{ wch:22 },{ wch:5 },{ wch:8 },{ wch:12 },{ wch:28 },{ wch:12 },
                   { wch:14 },{ wch:12 },{ wch:18 },{ wch:10 },{ wch:40 },{ wch:40 },{ wch:18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lab Bookings');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `lab-bookings-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('GET /lab/bookings/export', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN — clear all lab bookings
// DELETE /api/lab/bookings/clear
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/bookings/clear', requireAuth, requireSuperAdmin,
  [body('password').notEmpty().withMessage('Password is required.')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
      const me = await findUserById(req.user._id);
      const ok = await me.comparePassword(req.body.password);
      if (!ok) return res.status(401).json({ message: 'Incorrect password.' });
      const result = await execute('DELETE FROM lab_bookings', []);
      res.json({ message: `${result.affectedRows} lab bookings deleted.`, deletedCount: result.affectedRows });
    } catch (err) {
      console.error('DELETE /lab/bookings/clear', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — single booking
// GET /api/lab/bookings/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings/:id', requireAuth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM lab_bookings WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    res.json({ booking: mapBooking(rows[0]) });
  } catch (err) {
    console.error('GET /lab/bookings/:id', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — cancel booking
// DELETE /api/lab/bookings/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/bookings/:id', requireAuth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM lab_bookings WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    if (rows[0].status === 'cancelled') return res.status(400).json({ message: 'Already cancelled' });
    if (['report_ready', 'completed'].includes(rows[0].status))
      return res.status(400).json({ message: 'Cannot cancel a completed booking' });

    await execute("UPDATE lab_bookings SET status = 'cancelled' WHERE id = ?", [req.params.id]);

    // Send cancellation email
    try {
      const userRows = await query('SELECT email, name FROM users WHERE id = ?', [rows[0].user_id]);
      if (userRows[0]?.email) {
        await sendLabStatusUpdate(userRows[0].email, userRows[0].name, {
          _id: req.params.id, patientName: rows[0].patient_name, bookingDate: rows[0].booking_date,
        }, 'cancelled');
      }
    } catch (emailErr) { console.error('[mailer] lab cancel email failed:', emailErr.message); }

    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    console.error('DELETE /lab/bookings/:id', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — list all bookings
// GET /api/lab/bookings
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
    const offset = (page - 1) * limit;
    const status = req.query.status || '';

    const conditions = [];
    const params = [];
    if (status) { conditions.push('b.status = ?'); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM lab_bookings b ${where}`, params);
    const rows = await query(
      `SELECT b.*, u.email AS user_email, u.name AS user_name FROM lab_bookings b
       LEFT JOIN users u ON u.id = b.user_id ${where}
       ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ bookings: rows.map(mapBooking), total: Number(total), page, pages: Math.ceil(Number(total) / limit) });
  } catch (err) {
    console.error('GET /lab/bookings', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — update booking status
// PATCH /api/lab/bookings/:id/status
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/bookings/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending','confirmed','sample_collected','processing','report_ready','completed','cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const rows = await query('SELECT id FROM lab_bookings WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found' });

    await execute('UPDATE lab_bookings SET status = ? WHERE id = ?', [status, req.params.id]);

    // Send status update email
    try {
      const bookingRows = await query('SELECT b.*, u.email, u.name AS user_name FROM lab_bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?', [req.params.id]);
      const b = bookingRows[0];
      if (b?.email) {
        await sendLabStatusUpdate(b.email, b.user_name, {
          _id: req.params.id, patientName: b.patient_name, bookingDate: b.booking_date,
        }, status);
      }
    } catch (emailErr) { console.error('[mailer] lab status email failed:', emailErr.message); }

    res.json({ message: 'Status updated' });
  } catch (err) {
    console.error('PATCH /lab/bookings/:id/status', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — attach report URL
// PATCH /api/lab/bookings/:id/report
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/bookings/:id/report', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reportUrl } = req.body;
    if (!reportUrl) return res.status(400).json({ message: 'reportUrl required' });

    const rows = await query('SELECT id FROM lab_bookings WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found' });

    await execute(
      "UPDATE lab_bookings SET report_url = ?, status = 'report_ready' WHERE id = ?",
      [reportUrl, req.params.id]
    );

    // Send report ready email
    try {
      const bookingRows = await query('SELECT b.*, u.email, u.name AS user_name FROM lab_bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?', [req.params.id]);
      const b = bookingRows[0];
      if (b?.email) {
        await sendLabStatusUpdate(b.email, b.user_name, {
          _id: req.params.id, patientName: b.patient_name, bookingDate: b.booking_date,
        }, 'report_ready');
      }
    } catch (emailErr) { console.error('[mailer] lab report email failed:', emailErr.message); }

    res.json({ message: 'Report uploaded' });
  } catch (err) {
    console.error('PATCH /lab/bookings/:id/report', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — export lab tests as XLSX
// GET /api/lab/tests/export
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tests/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM lab_tests ORDER BY id ASC');
    const sheetData = [
      ['ID','Name','Category','Sample Type','Turnaround Time','MRP','Price','Home Collection','Active','Description'],
      ...rows.map(r => [r.id, r.name, r.category, r.sample_type, r.turnaround_time,
                        Number(r.mrp)||0, Number(r.price), r.home_collection ? 'Yes':'No',
                        r.is_active ? 'Yes':'No', r.description||'']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch:6 },{ wch:35 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:8 },{ wch:8 },{ wch:16 },{ wch:8 },{ wch:50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lab Tests');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `lab-tests-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('GET /lab/tests/export', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
