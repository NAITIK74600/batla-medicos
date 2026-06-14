/**
 * Import "current stock 2026.xlsx" into the products table.
 *
 * Column mapping (Excel → DB):
 *   BATLA MEDICOS  → code (barcode, when numeric)
 *   __EMPTY        → name (Item Name)
 *   __EMPTY_1      → (Unit — used to derive pack if pack column empty)
 *   __EMPTY_2      → pack
 *   __EMPTY_3      → stock (Qty)
 *   __EMPTY_6      → price / mrp (Rate)
 *   __EMPTY_9      → (HSNCODE — not stored, but logged)
 *   Company header → company, brand
 *
 * Logic:
 *   - Match by LOWER(name). If found → update stock + price.
 *   - If not found → insert new product.
 *   - Items with qty <= 0 are skipped (no stock).
 */

'use strict';

require('dotenv').config({ path: __dirname + '/backend/.env' });
const path = require('path');
const XLSX = require('xlsx');
const { query, execute } = require('./backend/db/mysql');

const FILE = path.join(__dirname, '..', 'current stock 2026.xlsx');

(async () => {
  console.log('Connected to DB.');

  // ── Read Excel ───────────────────────────────────────────────────
  const wb = XLSX.readFile(FILE, { raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // ── Parse items ──────────────────────────────────────────────────
  let currentCompany = '';
  const items = [];

  for (const r of rows.slice(5)) {
    const col0 = String(r['BATLA MEDICOS'] || '').trim();
    const name = String(r['__EMPTY'] || '').trim();

    // Company header row
    if (col0.startsWith('Company')) {
      currentCompany = col0.replace(/^Company\s*:\s*/i, '').trim();
      continue;
    }

    // Skip non-item rows
    if (!name || name.length < 2) continue;

    const qty   = parseInt(r['__EMPTY_3']) || 0;
    const rate  = parseFloat(r['__EMPTY_6']) || 0;
    const pack  = String(r['__EMPTY_2'] || '').trim();
    const unit  = String(r['__EMPTY_1'] || '').trim();
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

  console.log(`Parsed ${items.length} items from Excel.`);

  // ── Get default category ─────────────────────────────────────────
  const cats = await query('SELECT id FROM categories ORDER BY id ASC LIMIT 1');
  const defaultCatId = cats.length ? cats[0].id : 1;

  // ── Build name lookup of existing products ───────────────────────
  const existingRows = await query(
    'SELECT id, LOWER(name) AS name_key, price, stock FROM products WHERE is_deleted = 0'
  );
  const existingMap = new Map();
  for (const row of existingRows) {
    existingMap.set(row.name_key, row);
  }
  console.log(`Existing products in DB: ${existingMap.size}`);

  // ── Process ──────────────────────────────────────────────────────
  let updated = 0, inserted = 0, skipped = 0;

  for (const item of items) {
    const nameKey = item.name.toLowerCase();
    const existing = existingMap.get(nameKey);

    if (existing) {
      // Update stock and price if changed
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

      if (updates.length > 0) {
        vals.push(existing.id);
        await execute(
          `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
          vals
        );
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Insert new product
      const slugBase = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await execute(
          `INSERT INTO products
            (code, name, slug, category_id, brand, company, pack, mrp, price, stock, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
          [
            item.code,
            item.name,
            slug,
            defaultCatId,
            item.company,
            item.company,
            item.pack,
            item.price,
            item.price,
            item.stock,
          ]
        );
        inserted++;
      } catch (err) {
        // Slug collision — retry with timestamp
        try {
          const slug2 = `${slugBase}-${Date.now().toString(36)}`;
          await execute(
            `INSERT INTO products
              (code, name, slug, category_id, brand, company, pack, mrp, price, stock, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            [
              item.code,
              item.name,
              slug2,
              defaultCatId,
              item.company,
              item.company,
              item.pack,
              item.price,
              item.price,
              item.stock,
            ]
          );
          inserted++;
        } catch {
          skipped++;
          console.error(`  SKIP (insert failed): ${item.name}`);
        }
      }
      // Add to map so duplicate names in the file don't double-insert
      existingMap.set(nameKey, { id: -1, name_key: nameKey, price: item.price, stock: item.stock });
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`  Updated: ${updated}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (no change): ${skipped}`);
  console.log(`  Total processed: ${items.length}`);

  process.exit(0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
