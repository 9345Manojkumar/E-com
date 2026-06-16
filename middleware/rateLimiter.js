'use strict';

const rateLimit = require('express-rate-limit');

// ── ERR_ERL_UNEXPECTED_X_FORWARDED_FOR fix ────────────────────────────────
// On Render, Railway, Heroku the load balancer sets X-Forwarded-For.
// express-rate-limit v7 validates this against Express trust proxy setting.
// We silence the validation warning here because trust proxy is already
// correctly set to 1 in server.js — the warning is a false positive.
const baseOptions = {
  standardHeaders: true,
  legacyHeaders:   false,
  validate: {
    xForwardedForHeader: false,  // ← suppresses ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
    trustProxy:          false,  // ← we handle trust proxy in server.js ourselves
  },
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' }),
};

// ── OTP endpoints — max 5 per minute per IP ───────────────────────────────
const otpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 5,
});

// ── Login / signup / reset — max 10 per minute per IP ────────────────────
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 10,
});

// ── Order placement — max 20 per 5 minutes per IP ────────────────────────
const orderLimiter = rateLimit({
  ...baseOptions,
  windowMs: 5 * 60 * 1000,
  max: 20,
});

// ── General API — max 200 per minute per IP ───────────────────────────────
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 200,
});

module.exports = { otpLimiter, authLimiter, orderLimiter, apiLimiter };