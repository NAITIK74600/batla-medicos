'use strict';
/**
 * migrate-images-to-local.js
 *
 * Downloads every external image URL stored in products.images_json
 * and replaces it with a local /uploads/products/<hash>.<ext> path.
 *
 * NOTE: MySQL2 automatically parses JSON columns — images_json arrives
 *       as a JS array (or null), NOT as a raw string.
 *
 * Safe to re-run — already-local paths are left untouched.
 *
 * Usage (inside batla-medicos/backend/ with Node env activated):
 *   node scripts/migrate-images-to-local.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { query, execute } = require('../db/mysql');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// helpers
function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (ct.includes('png'))  return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif'))  return '.gif';
  return '.jpg';
}

function extFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|jfif|avif)$/i);
    if (m) return '.' + m[1].replace(/jfif/i, 'jpg');
  } catch (_) {}
  return '';
}

function downloadUrl(url, hops) {
  if (hops === undefined) hops = 5;
  return new Promise(function(resolve, reject) {
    if (hops < 0) return reject(new Error('Too many redirects: ' + url));
    var parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    var lib = parsed.protocol === 'https:' ? https : http;
    var req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BatlaMedicos/1.0)', 'Accept': 'image/*,*/*' },
      timeout: 20000,
    }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        return resolve(downloadUrl(new URL(res.headers.location, url).href, hops - 1));
      }
      if (res.statusCode !== 200) {
        req.destroy();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve({ buffer: Buffer.concat(chunks), ct: res.headers['content-type'] || '' }); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function localiseImage(url) {
  var res;
  try { res = await downloadUrl(url); }
  catch (e) { console.warn('    WARNING Download failed (' + e.message + '): ' + url); return null; }
  var ext = extFromUrl(url) || extFromContentType(res.ct);
  var filename = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), res.buffer);
  return '/uploads/products/' + filename;
}

// normalise whatever MySQL2 gives us for images_json
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) return [];
  var str = Buffer.isBuffer(val) ? val.toString('utf8') : String(val);
  var trimmed = str.trim();
  if (!trimmed) return [];
  try {
    var parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch (_) {
    return [trimmed];
  }
}

(async function() {
  console.log('=== migrate-images-to-local ===');

  var rows = await query(
    "SELECT id, name, images_json FROM products WHERE JSON_SEARCH(images_json, 'one', 'http%') IS NOT NULL"
  );

  console.log('Found ' + rows.length + ' product(s) with external image URLs.\n');

  var updated = 0, skipped = 0, failed = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var images = toArray(row.images_json);
    if (!images.some(function(u) { return typeof u === 'string' && u.startsWith('http'); })) {
      skipped++;
      continue;
    }

    console.log('[' + row.id + '] ' + row.name);
    var newImages = [];
    var changed = false;

    for (var j = 0; j < images.length; j++) {
      var imgUrl = images[j];
      if (typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) {
        newImages.push(imgUrl);
        continue;
      }
      process.stdout.write('  -> ' + imgUrl.substring(0, 80) + ' ... ');
      var localPath = await localiseImage(imgUrl);
      if (localPath) {
        process.stdout.write('OK: ' + localPath + '\n');
        newImages.push(localPath);
        changed = true;
      } else {
        process.stdout.write('FAILED (kept original)\n');
        newImages.push(imgUrl);
        failed++;
      }
    }

    if (changed) {
      await execute('UPDATE products SET images_json = ? WHERE id = ?', [JSON.stringify(newImages), row.id]);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('\nDone. Updated: ' + updated + '  Skipped: ' + skipped + '  Errors: ' + failed);
  process.exit(0);
})().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
