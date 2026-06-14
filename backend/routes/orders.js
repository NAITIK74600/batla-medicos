const express = require('express');
const crypto = require('crypto');
const { body, query: queryValidator, param, validationResult } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { query, execute } = require('../db/mysql');
const { notifyUser, notifyAdmin } = require('../utils/notify');
const { sendOrderConfirmation, sendOrderStatusUpdate } = require('../utils/mailer');

const router = express.Router();

// Fetch order items with product image fallback for old orders
const ORDER_ITEMS_SQL = `
  SELECT oi.id, oi.order_id, oi.product_id, oi.name, oi.price, oi.qty, oi.created_at,
         oi.image, p.images_json AS p_images
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = ?`;

// Fallback SQL if image column doesn't exist yet
const ORDER_ITEMS_SQL_FALLBACK = `
  SELECT oi.id, oi.order_id, oi.product_id, oi.name, oi.price, oi.qty, oi.created_at,
         NULL AS image, p.images_json AS p_images
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = ?`;

async function getOrderItems(orderId) {
  try {
    return await query(ORDER_ITEMS_SQL, [orderId]);
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return await query(ORDER_ITEMS_SQL_FALLBACK, [orderId]);
    }
    throw err;
  }
}

function mapOrder(row, items = []) {
  return {
    _id: String(row.id),
    user: row.user_id ? { _id: String(row.user_id), name: row.user_name || '', email: row.user_email || '', phone: row.user_phone || '' } : null,
    items: items.map(i => {
      // Resolve image: direct image field, or extract first from product images JSON
      let image = i.image || null;
      if (!image && i.p_images) {
        try {
          const parsed = typeof i.p_images === 'string' ? JSON.parse(i.p_images) : i.p_images;
          if (Array.isArray(parsed) && parsed.length) image = parsed[0];
          else if (typeof parsed === 'string') image = parsed;
        } catch { image = null; }
      }
      return {
        _id: String(i.id),
        product: i.product_id ? String(i.product_id) : null,
        name: i.name,
        price: Number(i.price),
        qty: Number(i.qty),
        image,
      };
    }),
    total: Number(row.total || 0),
    discount: Number(row.discount || 0),
    deliveryCharge: Number(row.delivery_charge || 0),
    couponCode: row.coupon_code || '',
    status: row.status || 'placed',
    paymentStatus: row.payment_status || 'pending',
    address: (() => { try { return typeof row.address_json === 'string' ? JSON.parse(row.address_json) : (row.address_json || null); } catch { return null; } })(),
    prescriptionUrl: row.prescription_url || '',
    notes: row.notes || '',
    razorpayOrderId: row.razorpay_order_id || '',
    deliveryOtp: row.delivery_otp || '',
    deliveryBoyId: row.delivery_boy_id ? String(row.delivery_boy_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/orders — create order (COD for now, Razorpay can be added later)
router.post('/', requireAuth, [
  body('items').isArray({ min: 1 }),
  body('address').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { items, address, couponCode, discount, deliveryCharge, prescriptionUrl, notes, paymentMethod } = req.body;

    let total = 0;
    const orderItems = [];
    for (const item of items) {
      const price = Number(item.price || 0);
      const qty = Number(item.qty || 1);
      total += price * qty;
      orderItems.push({
        product_id: item.productId || item.product || null,
        name: String(item.name || '').slice(0, 200),
        price,
        qty,
        image: item.image ? String(item.image).slice(0, 500) : null,
      });
    }

    total = total - Number(discount || 0) + Number(deliveryCharge || 0);
    if (total < 0) total = 0;

    const otp = String(Math.floor(1000 + Math.random() * 9000));

    const result = await execute(
      `INSERT INTO orders (user_id, total, status, payment_status, address_json, coupon_code, discount,
       delivery_charge, notes, prescription_url, delivery_otp)
       VALUES (?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        total,
        paymentMethod === 'online' ? 'pending' : 'cod',
        JSON.stringify(address),
        couponCode || null,
        Number(discount || 0),
        Number(deliveryCharge || 0),
        notes || null,
        prescriptionUrl || null,
        otp,
      ]
    );

    const orderId = result.insertId;

    // Insert items
    for (const item of orderItems) {
      try {
        await execute(
          'INSERT INTO order_items (order_id, product_id, name, price, qty, image) VALUES (?, ?, ?, ?, ?, ?)',
          [orderId, item.product_id, item.name, item.price, item.qty, item.image]
        );
      } catch (colErr) {
        // Fallback: image column may not exist yet (migration pending)
        if (colErr.code === 'ER_BAD_FIELD_ERROR') {
          await execute(
            'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.product_id, item.name, item.price, item.qty]
          );
        } else throw colErr;
      }
    }

    // If online payment requested, create Razorpay order
    if (paymentMethod === 'online' && process.env.RAZORPAY_KEY_ID) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        const rzpOrder = await rzp.orders.create({
          amount: Math.round(total * 100),
          currency: 'INR',
          receipt: `order_${orderId}`,
        });
        await execute('UPDATE orders SET razorpay_order_id = ? WHERE id = ?', [rzpOrder.id, orderId]);
        const rows = await query(
          `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
           FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
          [orderId]
        );
        const orderItemRows = await getOrderItems(orderId);
        return res.status(201).json({
          order: mapOrder(rows[0], orderItemRows),
          razorpayOrderId: rzpOrder.id,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
          amount: Math.round(total * 100),
        });
      } catch (rzpErr) {
        console.error('Razorpay order creation failed:', rzpErr.message);
        // Fall through to COD
      }
    }

    const rows = await query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [orderId]
    );
    const orderItemRows = await getOrderItems(orderId);

    // Fire notifications (fire-and-forget — don't block the response)
    const itemNames = orderItems.slice(0, 2).map(i => i.name).join(', ');
    const itemSuffix = orderItems.length > 2 ? ` +${orderItems.length - 2} more` : '';
    notifyUser(req.user.id, {
      type: 'order_placed',
      title: 'Order placed successfully!',
      message: `Your order #${orderId} has been placed. Items: ${itemNames}${itemSuffix}.`,
      link: `/orders/${orderId}`,
    });
    notifyAdmin({
      type: 'order_placed',
      title: `New order #${orderId}`,
      message: `${req.user.name || req.user.email} placed an order worth ₹${total.toFixed(2)}.`,
      link: `/admin/orders`,
    });

    // Send order confirmation email (fire-and-forget — don't hold up response)
    sendOrderConfirmation(req.user.email, req.user.name, {
      _id: String(orderId),
      items: orderItems.map(i => ({ name: i.name, price: i.price, qty: i.qty })),
      total,
      deliveryType: address?.deliveryType || 'delivery',
      takeawaySlot: address?.takeawaySlot,
    }).catch(err => console.error('[email] order confirm failed:', err.message));

    res.status(201).json({ order: mapOrder(rows[0], orderItemRows) });
  } catch (err) { next(err); }
});

// POST /api/orders/verify-payment
router.post('/verify-payment', requireAuth, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const generated = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed.' });
    }

    await execute(
      `UPDATE orders SET payment_status = 'paid', razorpay_payment_id = ? WHERE razorpay_order_id = ?`,
      [razorpay_payment_id, razorpay_order_id]
    );

    // Notify user that payment was confirmed
    const paidRows = await query(
      'SELECT id, user_id, total FROM orders WHERE razorpay_order_id = ? LIMIT 1',
      [razorpay_order_id]
    );
    if (paidRows[0]) {
      const { id: oid, user_id, total } = paidRows[0];
      notifyUser(user_id, {
        type: 'order_confirmed',
        title: 'Payment successful!',
        message: `Payment of ₹${Number(total).toFixed(2)} confirmed for order #${oid}.`,
        link: `/orders/${oid}`,
      });
      // Send order confirmation email (fire-and-forget)
      const oiRows = await query('SELECT name, price, qty FROM order_items WHERE order_id = ?', [oid]);
      sendOrderConfirmation(req.user.email, req.user.name, {
        _id: String(oid),
        items: oiRows.map(i => ({ name: i.name, price: Number(i.price), qty: Number(i.qty) })),
        total: Number(total),
        deliveryType: 'delivery',
      }).catch(err => console.error('[email] payment confirm failed:', err.message));
    }

    res.json({ message: 'Payment verified.' });
  } catch (err) { next(err); }
});

// GET /api/orders/my — customer's orders
router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.user_id = ? AND o.is_deleted = 0 ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    const orders = [];
    for (const row of rows) {
      const items = await getOrderItems(row.id);
      orders.push(mapOrder(row, items));
    }
    res.json({ orders });
  } catch (err) { next(err); }
});

// GET /api/orders/:id — single order
router.get('/:id', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? AND o.is_deleted = 0`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });

    // Customers can only see their own orders
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const items = await getOrderItems(req.params.id);
    res.json(mapOrder(rows[0], items));
  } catch (err) { next(err); }
});

// GET /api/orders — admin: all orders
router.get('/', requireAuth, requireAdmin, [
  queryValidator('page').optional().isInt({ min: 1 }).toInt(),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  queryValidator('status').optional().trim(),
], async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let whereSql = 'WHERE o.is_deleted = 0';
    const vals = [];
    if (status) { whereSql += ' AND o.status = ?'; vals.push(status); }

    const [rows, countRows] = await Promise.all([
      query(
        `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
         ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, vals),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const orders = [];
    for (const row of rows) {
      const items = await getOrderItems(row.id);
      orders.push(mapOrder(row, items));
    }
    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// PATCH /api/orders/:id/status — admin update status
router.patch('/:id/status', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(422).json({ message: 'Status required.' });

    // Fetch order + customer before updating so we can send notifications
    const orderRows = await query(
      `SELECT o.id, o.total, o.user_id, u.email AS user_email, u.name AS user_name
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!orderRows.length) return res.status(404).json({ message: 'Order not found.' });

    await execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    const { id: oid, total, user_id, user_email, user_name } = orderRows[0];

    // Bell notification to customer
    const STATUS_LABELS = {
      confirmed: 'Your order has been confirmed!',
      dispatched: 'Your order is on the way!',
      delivered: 'Your order has been delivered!',
      cancelled: 'Your order has been cancelled.',
    };
    if (user_id && STATUS_LABELS[status]) {
      notifyUser(user_id, {
        type: `order_${status}`,
        title: STATUS_LABELS[status],
        message: `Order #${oid} status updated to: ${status}.`,
        link: `/orders/${oid}`,
      });
    }

    // Email to customer (fire-and-forget)
    if (user_email) {
      sendOrderStatusUpdate(user_email, user_name, { _id: String(oid), total: Number(total) }, status)
        .catch(err => console.error('[email] status update failed:', err.message));
    }

    res.json({ message: 'Status updated.' });
  } catch (err) { next(err); }
});

// POST /api/orders/:id/verify-otp
// Only the admin, superadmin, or the delivery boy assigned to this order may verify the OTP.
router.post('/:id/verify-otp', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { otp } = req.body;
    const rows = await query(
      'SELECT delivery_otp, delivery_boy_id, user_id FROM orders WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });

    const order = rows[0];
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isAssignedDeliveryBoy = order.delivery_boy_id !== null &&
      Number(order.delivery_boy_id) === req.user.id;

    if (!isAdmin && !isAssignedDeliveryBoy) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    if (!otp || order.delivery_otp !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    await execute("UPDATE orders SET status = 'delivered' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Order delivered.' });
  } catch (err) { next(err); }
});

// POST /api/orders/:id/regenerate-otp
router.post('/:id/regenerate-otp', requireAuth, requireAdmin, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    await execute('UPDATE orders SET delivery_otp = ? WHERE id = ?', [otp, req.params.id]);
    res.json({ otp });
  } catch (err) { next(err); }
});

// POST /api/orders/:id/reorder
router.post('/:id/reorder', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });
    let items;
    try {
      items = await query(
        `SELECT oi.id, oi.product_id, oi.name, oi.price, oi.qty, oi.image,
                p.images_json AS p_images, p.slug, p.stock, p.price AS current_price, p.requires_prescription
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`, [req.params.id]);
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR') {
        items = await query(
          `SELECT oi.id, oi.product_id, oi.name, oi.price, oi.qty, NULL AS image,
                  p.images_json AS p_images, p.slug, p.stock, p.price AS current_price, p.requires_prescription
           FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = ?`, [req.params.id]);
      } else throw colErr;
    }
    res.json({ items: items.map(i => {
      let image = i.image || null;
      if (!image && i.p_images) {
        try { const arr = JSON.parse(i.p_images); if (Array.isArray(arr) && arr.length) image = arr[0]; } catch {}
      }
      const available = i.product_id ? (i.stock > 0) : false;
      return {
        productId: i.product_id, name: i.name,
        price: i.current_price != null ? Number(i.current_price) : Number(i.price),
        qty: Number(i.qty), image, slug: i.slug || null,
        requiresPrescription: !!i.requires_prescription,
        stock: i.stock != null ? Number(i.stock) : 0,
        available,
      };
    }) });
  } catch (err) { next(err); }
});

// Webhook placeholder — raw body already parsed in server.js
router.post('/webhook', (req, res) => {
  // TODO: Implement Razorpay webhook handling
  res.json({ status: 'ok' });
});

// GET /api/orders/:id/receipt — download PDF receipt
router.get('/:id/receipt', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const rows = await query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? AND o.is_deleted = 0`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const items = await getOrderItems(req.params.id);
    const r = rows[0];

    let addr = {};
    try { addr = typeof r.address_json === 'string' ? JSON.parse(r.address_json) : (r.address_json || {}); } catch {}

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${req.params.id}.pdf"`);
    doc.pipe(res);

    const path = require('path');
    const L = 50, R = 545, W = R - L;
    const GREEN = '#2e7d32', GRAY = '#666666', BLACK = '#1a1a1a';

    // ── Green header band ───────────────────────────────────────────────────
    doc.rect(0, 0, 595, 100).fill(GREEN);

    // Logo (left side of header)
    const logoPath = path.join(__dirname, '..', 'email-logo.jpg');
    try {
      doc.image(logoPath, L, 10, { width: 72, height: 72 });
    } catch (imgErr) { console.error('[receipt] logo load failed:', imgErr.message); }

    // Store name + contact (right of logo)
    const textX = L + 82;
    const textW = W - 82;
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('Batla Medicos', textX, 16, { width: textW });
    doc.fontSize(9).font('Helvetica')
      .text('F 41/2 Nafees Road, Batla House, Jamia Nagar, New Delhi - 110025', textX, 46, { width: textW })
      .text('Ph: +91 9990165925   |   ordersupport@batlamedicos.shop', textX, 60, { width: textW })
      .text('www.batlamedicos.shop', textX, 74, { width: textW });

    // ── Invoice meta ────────────────────────────────────────────────────────
    const invoiceNo = 'BM-' + String(r.id).padStart(6, '0');
    const dateStr = new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const payLabel = r.payment_status === 'cod' ? 'Cash on Delivery' : 'Online Payment';

    doc.fillColor(BLACK).fontSize(15).font('Helvetica-Bold')
      .text('TAX INVOICE', L, 114, { width: W, align: 'center' });
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
      .text(`Invoice No: ${invoiceNo}   |   Date: ${dateStr}   |   Status: ${String(r.status).toUpperCase()}   |   Payment: ${payLabel}`, L, 134, { width: W, align: 'center' });

    // ── Divider ─────────────────────────────────────────────────────────────
    doc.moveTo(L, 154).lineTo(R, 154).lineWidth(0.5).strokeColor('#cccccc').stroke();

    // ── Bill To / Deliver To ─────────────────────────────────────────────────
    let leftY = 164, rightY = 164;
    const MID = 320;

    doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold').text('Bill To:', L, leftY);
    leftY += 14;
    doc.fontSize(9).font('Helvetica').fillColor(GRAY);
    doc.text(r.user_name || 'Customer', L, leftY); leftY += 12;
    if (r.user_email) { doc.text(r.user_email, L, leftY); leftY += 12; }
    if (r.user_phone) { doc.text('Ph: ' + r.user_phone, L, leftY); leftY += 12; }

    doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold').text('Deliver To:', MID, rightY);
    rightY += 14;
    doc.fontSize(9).font('Helvetica').fillColor(GRAY);
    if (addr.line1) { doc.text(addr.line1, MID, rightY); rightY += 12; }
    if (addr.line2) { doc.text(addr.line2, MID, rightY); rightY += 12; }
    if (addr.city)  { doc.text(addr.city + (addr.pincode ? ' - ' + addr.pincode : ''), MID, rightY); rightY += 12; }
    if (addr.phone) { doc.text('Ph: ' + addr.phone, MID, rightY); rightY += 12; }

    // ── Items table ─────────────────────────────────────────────────────────
    let tableY = Math.max(leftY, rightY) + 16;

    // Table header row
    doc.rect(L, tableY, W, 20).fill('#f0f7f0');
    doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold');
    doc.text('Item', L + 6, tableY + 5, { width: 230 });
    doc.text('Qty', L + 240, tableY + 5, { width: 50, align: 'center' });
    doc.text('Rate (Rs)', L + 293, tableY + 5, { width: 80, align: 'right' });
    doc.text('Amount (Rs)', L + 378, tableY + 5, { width: 115, align: 'right' });

    tableY += 20;
    let subtotal = 0;
    let alt = false;
    doc.font('Helvetica').fontSize(9);

    for (const item of items) {
      const price = Number(item.price);
      const qty = Number(item.qty);
      const amount = price * qty;
      subtotal += amount;
      if (alt) doc.rect(L, tableY, W, 18).fill('#fafafa');
      alt = !alt;
      doc.fillColor(BLACK);
      const name = String(item.name || '').slice(0, 50);
      doc.text(name, L + 6, tableY + 4, { width: 228 });
      doc.text(String(qty), L + 240, tableY + 4, { width: 50, align: 'center' });
      doc.text(price.toFixed(2), L + 293, tableY + 4, { width: 80, align: 'right' });
      doc.text(amount.toFixed(2), L + 378, tableY + 4, { width: 115, align: 'right' });
      tableY += 18;
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    doc.moveTo(L, tableY).lineTo(R, tableY).lineWidth(0.5).strokeColor('#cccccc').stroke();
    tableY += 10;
    const total = Number(r.total || 0);

    doc.fillColor(GRAY).fontSize(9).font('Helvetica');
    doc.text('Subtotal:', L + 293, tableY, { width: 80, align: 'right' });
    doc.text('Rs ' + subtotal.toFixed(2), L + 378, tableY, { width: 115, align: 'right' });
    tableY += 16;
    doc.text('Delivery:', L + 293, tableY, { width: 80, align: 'right' });
    doc.text('FREE', L + 378, tableY, { width: 115, align: 'right' });
    tableY += 14;
    doc.moveTo(L + 293, tableY).lineTo(R, tableY).lineWidth(0.5).strokeColor('#cccccc').stroke();
    tableY += 8;
    doc.fillColor(GREEN).fontSize(11).font('Helvetica-Bold');
    doc.text('Grand Total:', L + 293, tableY, { width: 80, align: 'right' });
    doc.text('Rs ' + total.toFixed(2), L + 378, tableY, { width: 115, align: 'right' });

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = 755;
    doc.moveTo(L, footerY).lineTo(R, footerY).lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.fillColor(GRAY).fontSize(8).font('Helvetica');
    doc.text('Thank you for shopping with Batla Medicos!', L, footerY + 8, { width: W, align: 'center' });
    doc.text('This is a computer-generated invoice and does not require a physical signature.', L, footerY + 20, { width: W, align: 'center' });

    doc.end();
  } catch (err) { next(err); }
});

// POST /api/orders/:id/resend-receipt — resend order confirmation email
router.post('/:id/resend-receipt', requireAuth, [param('id').isInt({ min: 1 })], async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? AND o.is_deleted = 0`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    const items = await query('SELECT name, price, qty FROM order_items WHERE order_id = ?', [req.params.id]);
    const r = rows[0];
    await sendOrderConfirmation(r.user_email, r.user_name, {
      _id: String(r.id),
      items: items.map(i => ({ name: i.name, price: Number(i.price), qty: Number(i.qty) })),
      total: Number(r.total),
      deliveryType: 'delivery',
    });
    res.json({ message: 'Receipt email sent.' });
  } catch (err) { next(err); }
});

module.exports = router;
