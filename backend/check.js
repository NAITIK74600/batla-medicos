'use strict';
/**
 * Batla Medicos — Full Server Diagnostic & Fix Script
 * Run on cPanel: node check.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   BATLA MEDICOS — DIAGNOSTIC REPORT');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 1. ENV Variables ──────────────────────────────────────────────────────
  console.log('── 1. ENV VARIABLES ─────────────────────────────────');
  const required = {
    PORT:               process.env.PORT,
    NODE_ENV:           process.env.NODE_ENV,
    MYSQL_HOST:         process.env.MYSQL_HOST,
    MYSQL_USER:         process.env.MYSQL_USER,
    MYSQL_PASSWORD:     process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE:     process.env.MYSQL_DATABASE,
    JWT_SECRET:         process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    GEMINI_API_KEY:     process.env.GEMINI_API_KEY,
    MAIL_HOST:          process.env.MAIL_HOST,
    MAIL_USER:          process.env.MAIL_USER,
    MAIL_PASS:          process.env.MAIL_PASS,
    GOOGLE_CLIENT_ID:   process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    FRONTEND_URL:       process.env.FRONTEND_URL,
    DEPLOY_SECRET:      process.env.DEPLOY_SECRET,
  };
  let envOk = true;
  for (const [k, v] of Object.entries(required)) {
    if (v) {
      const display = ['PASSWORD','SECRET','PASS','KEY'].some(s => k.includes(s))
        ? v.slice(0, 4) + '****'
        : v;
      console.log(`  ${PASS} ${k} = ${display}`);
    } else {
      console.log(`  ${FAIL} ${k} = MISSING`);
      envOk = false;
    }
  }
  console.log(envOk ? `\n  ${PASS} All ENV vars present.\n` : `\n  ${FAIL} Some ENV vars missing! Update .env file.\n`);

  // ── 2. node_modules ───────────────────────────────────────────────────────
  console.log('── 2. NODE_MODULES ──────────────────────────────────');
  const nmPath = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nmPath)) {
    console.log(`  ${PASS} node_modules exists\n`);
  } else {
    console.log(`  ${FAIL} node_modules MISSING — run: npm install\n`);
  }

  // ── 3. MySQL Connection ───────────────────────────────────────────────────
  console.log('── 3. MYSQL CONNECTION ──────────────────────────────');
  let conn;
  try {
    conn = await mysql.createConnection({
      host:     process.env.MYSQL_HOST || 'localhost',
      port:     Number(process.env.MYSQL_PORT || 3306),
      user:     process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
    console.log(`  ${PASS} Connected to MySQL as '${process.env.MYSQL_USER}' @ ${process.env.MYSQL_HOST}`);

    // ── 4. Tables & Row Counts ──────────────────────────────────────────────
    console.log('\n── 4. TABLES & ROW COUNTS ───────────────────────────');
    const tables = ['categories', 'products', 'users', 'orders', 'coupons', 'lab_tests', 'offers'];
    for (const t of tables) {
      try {
        const [[row]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
        const count = row.c;
        const icon = count > 0 ? PASS : WARN;
        console.log(`  ${icon} ${t.padEnd(15)} — ${count} rows`);
      } catch (e) {
        console.log(`  ${FAIL} ${t.padEnd(15)} — TABLE MISSING (${e.message})`);
      }
    }

    // ── 5. Products check ───────────────────────────────────────────────────
    console.log('\n── 5. PRODUCTS SAMPLE CHECK ─────────────────────────');
    try {
      const [[pRow]] = await conn.query('SELECT COUNT(*) AS c FROM products WHERE is_active=1 AND is_deleted=0');
      if (pRow.c > 0) {
        console.log(`  ${PASS} ${pRow.c} active products found — frontend "Loading..." should resolve`);
      } else {
        console.log(`  ${FAIL} 0 active products — this is why frontend shows "Loading..."`);
        console.log(`       Fix: Import products using: node scripts/resetMySqlFromExcel.js`);
      }
    } catch(e) {
      console.log(`  ${FAIL} Products check failed: ${e.message}`);
    }

    // ── 6. Schema migration check ───────────────────────────────────────────
    console.log('\n── 6. SCHEMA COLUMNS CHECK ──────────────────────────');
    const colChecks = [
      { table: 'products', col: 'lifestyle_category' },
      { table: 'products', col: 'salt' },
      { table: 'users',    col: 'role' },
      { table: 'orders',   col: 'status' },
    ];
    for (const { table, col } of colChecks) {
      try {
        const [[r]] = await conn.query(
          `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
          [process.env.MYSQL_DATABASE, table, col]
        );
        console.log(`  ${r.c > 0 ? PASS : FAIL} ${table}.${col} ${r.c > 0 ? 'exists' : 'MISSING'}`);
      } catch(e) {
        console.log(`  ${FAIL} Could not check ${table}.${col}: ${e.message}`);
      }
    }

    await conn.end();
  } catch (e) {
    console.log(`  ${FAIL} MySQL FAILED: ${e.message}`);
    console.log(`       Check MYSQL_USER/PASSWORD/DATABASE in .env\n`);
  }

  // ── 7. SMTP Connection ────────────────────────────────────────────────────
  console.log('\n── 7. SMTP EMAIL CONNECTION ─────────────────────────');
  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.MAIL_HOST,
      port:   Number(process.env.MAIL_PORT || 587),
      secure: Number(process.env.MAIL_PORT || 587) === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      connectionTimeout: 5000,
      greetingTimeout:   5000,
      socketTimeout:     5000,
    });
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 6s')), 6000)),
    ]);
    console.log(`  ${PASS} SMTP OK — ${process.env.MAIL_HOST}:${process.env.MAIL_PORT}\n`);
  } catch (e) {
    console.log(`  ${WARN} SMTP FAILED: ${e.message} (non-critical — emails only)\n`);
  }

  // ── 8. Key files check ────────────────────────────────────────────────────
  console.log('── 8. KEY FILES CHECK ───────────────────────────────');
  const files = [
    'server.js', '.env', 'db/mysql.js', 'db/schema.js',
    'routes/products.js', 'routes/auth.js', 'routes/orders.js',
    'utils/gemini.js', 'utils/mailer.js',
  ];
  for (const f of files) {
    const exists = fs.existsSync(path.join(__dirname, f));
    console.log(`  ${exists ? PASS : FAIL} ${f}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('   DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('Next steps:');
  console.log('  1. Fix any ❌ above');
  console.log('  2. If products=0 → run: node scripts/resetMySqlFromExcel.js');
  console.log('  3. Start server: node server.js');
  console.log('  4. For permanent running: use cPanel "Setup Node.js App" → Restart');
  console.log('');
}

main().catch(e => {
  console.error('Script error:', e.message);
  process.exit(1);
});
