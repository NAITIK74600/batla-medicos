'use strict';

const crypto = require('crypto');
const { execute, query } = require('./mysql');

async function createRefreshToken(userId) {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

  await execute(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)',
    [userId, token, expiresAt]
  );

  return token;
}

async function verifyAndRotateRefreshToken(token) {
  const rows = await query(
    'SELECT * FROM refresh_tokens WHERE token = ? AND used = 0 LIMIT 1',
    [token]
  );
  const record = rows[0];
  if (!record) return null;

  if (new Date(record.expires_at) < new Date()) {
    await execute('DELETE FROM refresh_tokens WHERE id = ?', [record.id]);
    return null;
  }

  await execute('UPDATE refresh_tokens SET used = 1 WHERE id = ?', [record.id]);
  return String(record.user_id);
}

async function deleteRefreshToken(token) {
  await execute('DELETE FROM refresh_tokens WHERE token = ?', [token]);
}

async function deleteRefreshTokensForUser(userId) {
  await execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
}

module.exports = {
  createRefreshToken,
  verifyAndRotateRefreshToken,
  deleteRefreshToken,
  deleteRefreshTokensForUser,
};