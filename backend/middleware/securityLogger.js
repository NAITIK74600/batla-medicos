'use strict';

const { execute } = require('../db/mysql');

/**
 * Write a security event to the security_events table (fire-and-forget).
 * Never throws — errors are swallowed so callers are never disrupted.
 *
 * @param {string} eventType  'LOGIN_SUCCESS' | 'LOGIN_FAIL' | 'PASSWORD_RESET_REQUEST'
 *                            | 'PASSWORD_RESET_SUCCESS' | 'IDOR_ATTEMPT'
 *                            | 'ANOMALOUS_TRAFFIC' | etc.
 * @param {object} opts
 * @param {number|null} opts.userId
 * @param {string|null} opts.email
 * @param {string|null} opts.ip
 * @param {string|null} opts.userAgent
 * @param {object|null} opts.details   – arbitrary JSON payload
 */
function logSecurityEvent(eventType, { userId = null, email = null, ip = null, userAgent = null, details = null } = {}) {
  execute(
    `INSERT INTO security_events (event_type, user_id, email, ip, user_agent, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(eventType).slice(0, 80),
      userId  ? Number(userId)  : null,
      email   ? String(email).slice(0, 190) : null,
      ip      ? String(ip).slice(0, 100)    : null,
      userAgent ? String(userAgent).slice(0, 500) : null,
      details ? JSON.stringify(details) : null,
    ]
  ).catch(() => {}); // intentionally fire-and-forget
}

// ── Per-IP 401/403 counter (in-process, resets on restart) ─────────────────
const WINDOW_MS  = 60 * 1000; // 1-minute sliding window
const THRESHOLD  = 10;        // flag after 10 unauthorized responses/min/IP
const ipCounters = new Map(); // ip -> { count, firstSeen }

/**
 * Express middleware that intercepts JSON responses.
 * When a single IP generates ≥ THRESHOLD 401/403s within WINDOW_MS,
 * writes an ANOMALOUS_TRAFFIC event to security_events.
 * Attach BEFORE routes in server.js.
 */
function monitorUnauthorizedResponses(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body) {
    const status = res.statusCode;
    if (status === 401 || status === 403) {
      const ip  = req.ip || 'unknown';
      const now = Date.now();

      let entry = ipCounters.get(ip);
      if (!entry || now - entry.firstSeen > WINDOW_MS) {
        entry = { count: 0, firstSeen: now };
      }
      entry.count += 1;
      ipCounters.set(ip, entry);

      if (entry.count === THRESHOLD) {
        logSecurityEvent('ANOMALOUS_TRAFFIC', {
          ip,
          userAgent: req.headers['user-agent'],
          details: {
            count:    entry.count,
            windowMs: WINDOW_MS,
            status,
            path:     req.path,
          },
        });
      }
    }
    return originalJson(body);
  };

  next();
}

// Prune stale entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, entry] of ipCounters) {
    if (entry.firstSeen < cutoff) ipCounters.delete(ip);
  }
}, 5 * 60 * 1000).unref();

module.exports = { logSecurityEvent, monitorUnauthorizedResponses };
