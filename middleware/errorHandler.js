'use strict';

// ── Custom error class ────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.isOperational = true;
  }
}

// ── Wrap async route handlers — eliminates try/catch boilerplate ──
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ── Central error response handler (mount LAST in Express) ────────
function errorHandler(err, req, res, _next) {
  // Operational errors (AppError) → send the exact message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }

  // MySQL / Sequelize errors — map to readable messages
  if (err.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ error: 'A record with this value already exists.' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2')
    return res.status(400).json({ error: 'Referenced record not found.' });
  if (err.code === 'ER_BAD_FIELD_ERROR')
    return res.status(500).json({ error: 'Database column mismatch. Run fix_schema.sql.' });
  if (err.code === 'ER_DATA_TOO_LONG')
    return res.status(400).json({
      error: 'Image or text is too large for the database column. ' +
             'Run widen_image_columns.sql, or upload smaller images (under 200KB).',
    });
  if (err.code === 'ER_NET_PACKET_TOO_LARGE')
    return res.status(413).json({ error: 'Upload too large. Please use smaller or fewer images.' });

  // JWT errors
  if (err.name === 'JsonWebTokenError')
    return res.status(401).json({ error: 'Invalid token. Please log in again.' });
  if (err.name === 'TokenExpiredError')
    return res.status(401).json({ error: 'Session expired. Please log in again.' });

  // Unknown / programming errors — log full details, send generic message
  console.error('❌ Unhandled error:', err.stack || err);
  res.status(500).json({ error: 'Internal server error. Please try again.' });
}

module.exports = { AppError, asyncHandler, errorHandler };