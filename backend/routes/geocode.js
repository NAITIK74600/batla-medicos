const express = require('express');
const https   = require('https');

const router = express.Router();

/**
 * GET /api/geocode/reverse?lat=28.5&lng=77.2
 *
 * Server-side proxy for Nominatim reverse geocoding.
 * Browsers cannot set a custom User-Agent header in fetch(), causing Nominatim
 * to reject requests. Calling from Node.js solves this completely.
 *
 * No auth required — coordinates reveal nothing sensitive, and Nominatim is a
 * free public API. Rate-limited by the global API limiter on the server.
 */
router.get('/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (!req.query.lat || !req.query.lng || isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ message: 'lat and lng query params are required.' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ message: 'Coordinates out of range.' });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent':       'BatlaMedicos/1.0 (contact@batlamedicos.shop)',
          'Accept':           'application/json',
          'Accept-Language':  'en',
          'Referer':          'https://batlamedicos.shop',
        },
        timeout: 12000,
      }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          return reject(new Error(`Nominatim HTTP ${response.statusCode}`));
        }
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Invalid JSON from Nominatim')); }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Nominatim timeout')); });
      req.on('error', reject);
    });

    const a = data.address || {};

    // Build structured address fields
    const line1 = [
      a.shop || a.amenity || a.building,
      a.house_number,
      a.road || a.pedestrian || a.path || a.footway,
      a.neighbourhood || a.suburb,
    ].filter(Boolean).join(', ')
      || data.display_name?.split(',').slice(0, 3).join(', ')
      || '';

    const line2 = [
      a.quarter,
      a.locality,
      a.village || a.town,
      a.county || a.state_district,
    ].filter(Boolean).join(', ');

    const city    = a.city || a.town || a.village || a.municipality || a.district || a.state_district || '';
    const pincode = (a.postcode || '').replace(/\s/g, '');
    const state   = a.state || '';

    return res.json({ line1, line2, city, pincode, state, raw: a });
  } catch (err) {
    console.error('[geocode] reverse geocode failed:', err.message);
    return res.status(502).json({ message: 'Address lookup failed. Please fill in your address manually.' });
  }
});

module.exports = router;
