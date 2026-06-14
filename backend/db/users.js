'use strict';

const bcrypt = require('bcryptjs');
const { execute, query } = require('./mysql');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hydrateUser(row) {
  if (!row) return null;

  const user = {
    _id: String(row.id),
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    authProvider: row.auth_provider,
    googleId: row.google_id,
    addresses: parseJson(row.addresses_json, []),
    familyMembers: parseJson(row.family_members_json, []),
    isBanned: Boolean(row.is_banned),
    emailVerified: Boolean(row.email_verified),
    emailVerifyToken: row.email_verify_token,
    emailVerifyExpiry: row.email_verify_expiry,
    emailOtp: row.email_otp,
    emailOtpExpiry: row.email_otp_expiry,
    resetOtp: row.reset_otp,
    resetOtpExpiry: row.reset_otp_expiry,
    passwordHash: row.password_hash,
    failedLoginAttempts: row.failed_login_attempts || 0,
    lockUntil: row.lock_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comparePassword(plain) {
      return bcrypt.compare(plain, this.passwordHash || '');
    },
    isLocked() {
      return Boolean(this.lockUntil && new Date(this.lockUntil) > new Date());
    },
    toSafeObject() {
      return {
        _id: this._id,
        name: this.name,
        email: this.email,
        phone: this.phone,
        role: this.role,
        authProvider: this.authProvider,
        googleId: this.googleId,
        addresses: this.addresses,
        familyMembers: this.familyMembers,
        isBanned: this.isBanned,
        emailVerified: this.emailVerified,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
  };

  return user;
}

function serializeUserPayload(user) {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'customer',
    auth_provider: user.authProvider || 'local',
    google_id: user.googleId || null,
    addresses_json: JSON.stringify(user.addresses || []),
    family_members_json: JSON.stringify(user.familyMembers || []),
    is_banned: user.isBanned ? 1 : 0,
    email_verified: user.emailVerified ? 1 : 0,
    email_verify_token: user.emailVerifyToken || null,
    email_verify_expiry: user.emailVerifyExpiry || null,
    email_otp: user.emailOtp || null,
    email_otp_expiry: user.emailOtpExpiry || null,
    reset_otp: user.resetOtp || null,
    reset_otp_expiry: user.resetOtpExpiry || null,
    password_hash: user.passwordHash || null,
    failed_login_attempts: Number(user.failedLoginAttempts || 0),
    lock_until: user.lockUntil || null,
  };
}

async function findUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return hydrateUser(rows[0]);
}

async function findUserByEmail(email) {
  const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email || '').toLowerCase()]);
  return hydrateUser(rows[0]);
}

async function findUserByGoogleOrEmail(email, googleId) {
  const rows = await query(
    'SELECT * FROM users WHERE email = ? OR google_id = ? LIMIT 1',
    [String(email || '').toLowerCase(), googleId || null]
  );
  return hydrateUser(rows[0]);
}

async function findUserByEmailVerifyToken(tokenHash) {
  const rows = await query(
    'SELECT * FROM users WHERE email_verify_token = ? AND email_verify_expiry > NOW() LIMIT 1',
    [tokenHash]
  );
  return hydrateUser(rows[0]);
}

async function findUserByResetOtp(email, otpHash) {
  const rows = await query(
    'SELECT * FROM users WHERE email = ? AND reset_otp = ? AND reset_otp_expiry > NOW() LIMIT 1',
    [String(email || '').toLowerCase(), otpHash]
  );
  return hydrateUser(rows[0]);
}

async function createUser(user) {
  const payload = serializeUserPayload(user);
  const result = await execute(
    `INSERT INTO users (
      name, email, phone, role, auth_provider, google_id, addresses_json, family_members_json,
      is_banned, email_verified, email_verify_token, email_verify_expiry, email_otp, email_otp_expiry,
      reset_otp, reset_otp_expiry, password_hash, failed_login_attempts, lock_until
    ) VALUES (
      :name, :email, :phone, :role, :auth_provider, :google_id, :addresses_json, :family_members_json,
      :is_banned, :email_verified, :email_verify_token, :email_verify_expiry, :email_otp, :email_otp_expiry,
      :reset_otp, :reset_otp_expiry, :password_hash, :failed_login_attempts, :lock_until
    )`,
    payload
  );
  return findUserById(result.insertId);
}

async function updateUser(user) {
  const payload = serializeUserPayload(user);
  payload.id = user.id || Number(user._id);
  await execute(
    `UPDATE users SET
      name = :name,
      email = :email,
      phone = :phone,
      role = :role,
      auth_provider = :auth_provider,
      google_id = :google_id,
      addresses_json = :addresses_json,
      family_members_json = :family_members_json,
      is_banned = :is_banned,
      email_verified = :email_verified,
      email_verify_token = :email_verify_token,
      email_verify_expiry = :email_verify_expiry,
      email_otp = :email_otp,
      email_otp_expiry = :email_otp_expiry,
      reset_otp = :reset_otp,
      reset_otp_expiry = :reset_otp_expiry,
      password_hash = :password_hash,
      failed_login_attempts = :failed_login_attempts,
      lock_until = :lock_until
    WHERE id = :id`,
    payload
  );
  return findUserById(payload.id);
}

async function deleteUserById(id) {
  await execute('DELETE FROM users WHERE id = ?', [id]);
}

async function listUsers({ roles, search, limit = 20, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (roles && roles.length) {
    where.push(`role IN (${roles.map(() => '?').join(', ')})`);
    params.push(...roles);
  }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT * FROM users ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  return rows.map(hydrateUser);
}

async function countUsers({ roles, search } = {}) {
  const where = [];
  const params = [];

  if (roles && roles.length) {
    where.push(`role IN (${roles.map(() => '?').join(', ')})`);
    params.push(...roles);
  }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
  return Number(rows[0]?.total || 0);
}

module.exports = {
  hydrateUser,
  findUserById,
  findUserByEmail,
  findUserByGoogleOrEmail,
  findUserByEmailVerifyToken,
  findUserByResetOtp,
  createUser,
  updateUser,
  deleteUserById,
  listUsers,
  countUsers,
};