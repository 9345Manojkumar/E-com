'use strict';

// ── Trim a string and cap its length ─────────────────────────────
function trim(value, maxLen = 255) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

// ── Assert a value is a positive decimal number ───────────────────
function posDec(value, fieldName = 'value') {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0)
    throw new Error(`${fieldName} must be a positive number.`);
  return n;
}

// ── Common regex patterns ─────────────────────────────────────────
const patterns = {
  mobile:  /^[6-9]\d{9}$/,
  email:   /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pincode: /^\d{6}$/,
  gstin:   /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$/,
};

// ── Middleware: validate required body fields ─────────────────────
// Usage: validateBody(['field1', 'field2'])
function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(f => {
      const v = req.body[f];
      return v === undefined || v === null || v === '';
    });
    if (missing.length)
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    next();
  };
}

module.exports = { trim, posDec, patterns, validateBody };