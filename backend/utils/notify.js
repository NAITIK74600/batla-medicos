'use strict';
const { execute } = require('../db/mysql');

/**
 * Create a notification for a specific user.
 */
async function notifyUser(userId, { type = 'general', title, message, link = null }) {
  try {
    await execute(
      `INSERT INTO notifications (user_id, type, title, message, is_admin, link) VALUES (?, ?, ?, ?, 0, ?)`,
      [userId, type, title || '', message || null, link]
    );
  } catch (e) {
    console.error('[notify] user notif failed:', e.message);
  }
}

/**
 * Create a notification visible in the admin dashboard.
 */
async function notifyAdmin({ type = 'general', title, message, link = null }) {
  try {
    await execute(
      `INSERT INTO notifications (user_id, type, title, message, is_admin, link) VALUES (NULL, ?, ?, ?, 1, ?)`,
      [type, title || '', message || null, link]
    );
  } catch (e) {
    console.error('[notify] admin notif failed:', e.message);
  }
}

module.exports = { notifyUser, notifyAdmin };
