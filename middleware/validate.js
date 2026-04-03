// middleware/validate.js — Palm Legacy v3.1
// Lightweight body validation — expanded fully in Step 2
// Usage: router.post('/path', validateBody(schema), handler)
'use strict';

const { AppError } = require('./errorHandler');

/**
 * Validates req.body against a schema object.
 * Schema: { fieldName: { required, maxLength, minLength, pattern, message, type, min, max, enum } }
 *
 * Example:
 *   validateBody({
 *     mobile:  { required: true, pattern: patterns.mobile.pattern, message: patterns.mobile.message },
 *     email:   { required: false, pattern: patterns.email.pattern,  message: patterns.email.message },
 *     purpose: { required: false, enum: ['login','signup','reset'] },
 *   })
 */
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const raw     = req.body[field];
      const missing = raw === undefined || raw === null || raw === '';

      if (rules.required && missing) {
        errors.push(`${field} is required.`);
        continue;
      }
      if (missing) continue; // optional and absent — skip all further checks

      const str = String(raw).trim();

      if (rules.maxLength && str.length > rules.maxLength)
        errors.push(`${field} must be at most ${rules.maxLength} characters.`);

      if (rules.minLength && str.length < rules.minLength)
        errors.push(`${field} must be at least ${rules.minLength} characters.`);

      if (rules.pattern && !rules.pattern.test(str))
        errors.push(`${field} ${rules.message || 'has an invalid format'}.`);

      if (rules.type === 'number' && isNaN(Number(raw)))
        errors.push(`${field} must be a number.`);

      if (rules.type === 'number' && rules.min !== undefined && Number(raw) < rules.min)
        errors.push(`${field} must be at least ${rules.min}.`);

      if (rules.type === 'number' && rules.max !== undefined && Number(raw) > rules.max)
        errors.push(`${field} must be at most ${rules.max}.`);

      if (rules.enum && !rules.enum.includes(raw))
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}.`);
    }

    if (errors.length)
      return next(new AppError(errors.join(' '), 400, 'VALIDATION_ERROR'));

    next();
  };
}

// ─── Reusable pattern definitions ─────────────────────────────────────────
const patterns = {
  mobile: {
    pattern: /^[6-9]\d{9}$/,
    message: 'must be a valid 10-digit Indian mobile number',
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'must be a valid email address',
  },
  pincode: {
    pattern: /^\d{6}$/,
    message: 'must be a 6-digit Indian pincode',
  },
  otp: {
    pattern: /^\d{6}$/,
    message: 'must be exactly 6 digits',
  },
  password: {
    pattern: /^.{8,}$/,
    message: 'must be at least 8 characters',
  },
};

// ─── Quick sanitize helpers ────────────────────────────────────────────────
// Use these inline before DB inserts to enforce max-length at the data layer
function trim(val, max = 200) {
  return String(val || '').trim().slice(0, max);
}

function posInt(val, fallback = 0) {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

function posDec(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) || n < 0 ? fallback : n;
}

module.exports = { validateBody, patterns, trim, posInt, posDec };
