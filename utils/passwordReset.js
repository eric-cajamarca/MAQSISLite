const crypto = require('crypto');
const { pool } = require('../db');

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toMysqlDatetime(d) {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

async function createResetToken(idUsuario) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = toMysqlDatetime(Date.now() + EXPIRY_MS);

  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id_usuario = ? AND used_at IS NULL',
    [idUsuario]
  );

  await pool.query(
    'INSERT INTO password_reset_tokens (id_usuario, token_hash, expires_at) VALUES (?, ?, ?)',
    [idUsuario, tokenHash, expiresAt]
  );

  return token;
}

async function validateResetToken(token) {
  if (!token || typeof token !== 'string') return null;

  const tokenHash = hashToken(token);
  const [[row]] = await pool.query(
    `SELECT t.id, t.id_usuario, t.expires_at, t.used_at, u.activo
     FROM password_reset_tokens t
     INNER JOIN usuarios u ON u.id = t.id_usuario
     WHERE t.token_hash = ?`,
    [tokenHash]
  );

  if (!row || row.used_at || !row.activo) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return { tokenId: row.id, idUsuario: row.id_usuario };
}

async function markTokenUsed(tokenId) {
  await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [tokenId]);
}

module.exports = { createResetToken, validateResetToken, markTokenUsed };
