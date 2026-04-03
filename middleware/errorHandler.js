// middleware/errorHandler.js — Palm Legacy v3.1
// Central error handling: AppError class, asyncHandler wrapper, global handler
'use strict';

// ─── Typed operational error ───────────────────────────────────────────────
class AppError extends Error {
  /**
   * @param {string}  message    - Human-readable message returned to client
   * @param {number}  statusCode - HTTP status (400, 401, 403, 404, 409, 500 …)
   * @param {string}  [code]     - Machine-readable code e.g. 'VALIDATION_ERROR'
   */
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name       = 'AppError';
    this.statusCode = statusCode;
    this.code       = code;
    this.isOperational = true; // distinguish from unexpected bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Drop-in replacement for the old inline `wrap()` ──────────────────────
// Catches any rejected promise and forwards it to Express error pipeline
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── Global error handler — register LAST in server.js ────────────────────
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Always log with request context
  const label = `[${req.method} ${req.path}]`;
  console.error(`❌ ${label}`, err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);

  // ── MySQL errors → meaningful messages ──────────────────────────────────
  if (err.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ error: 'A record with this value already exists.' });

  if (err.code === 'ER_NO_REFERENCED_ROW_2')
    return res.status(400).json({ error: 'Referenced record does not exist.' });

  if (err.code === 'ER_BAD_FIELD_ERROR')
    return res.status(500).json({
      error: 'Database column mismatch — please run fix_schema.sql.',
      code: 'SCHEMA_MISMATCH',
    });

  if (err.code === 'ER_DATA_TOO_LONG')
    return res.status(400).json({ error: 'One or more fields exceed the maximum allowed length.' });

  // ── JWT errors ────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError')
    return res.status(401).json({ error: 'Invalid token. Please sign in again.', code: 'INVALID_TOKEN' });

  if (err.name === 'TokenExpiredError')
    return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_EXPIRED' });

  // ── Operational errors (AppError instances) ────────────────────────────
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }

  // ── Unknown / programmer errors ────────────────────────────────────────
  // Never expose internals in production
  const status  = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred. Please try again.'
    : err.message;

  res.status(status).json({ error: message });
}

module.exports = { AppError, asyncHandler, errorHandler };
