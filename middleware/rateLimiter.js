// middleware/rateLimiter.js — Palm Legacy v3.1
// Express rate-limit configurations per endpoint sensitivity
// npm install express-rate-limit
'use strict';

const rateLimit = require('express-rate-limit');

// ─── OTP send endpoint — strictest limit ──────────────────────────────────
// 5 OTP requests per identifier per 15 minutes
// Keyed on the identifier (phone/email) so users can't bypass by rotating IPs
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: req => (req.body?.identifier || req.ip).toLowerCase(),
  handler: (_req, res) =>
    res.status(429).json({
      error: 'Too many OTP requests. Please wait 15 minutes before requesting another.',
      code: 'OTP_RATE_LIMITED',
    }),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ─── Auth endpoints (login / signup / reset) ──────────────────────────────
// 20 attempts per IP per 15 minutes — prevents brute-force on passwords
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  handler: (_req, res) =>
    res.status(429).json({
      error: 'Too many sign-in attempts. Please try again in 15 minutes.',
      code: 'AUTH_RATE_LIMITED',
    }),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Global API limiter ───────────────────────────────────────────────────
// 300 requests per minute per IP — generous for legitimate use
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  handler: (_req, res) =>
    res.status(429).json({
      error: 'Rate limit exceeded. Please slow down.',
      code: 'API_RATE_LIMITED',
    }),
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === '/health', // health checks never counted
});

// ─── Order placement — prevent duplicate rapid orders ─────────────────────
// 10 orders per hour per user (keyed on JWT user id if present, else IP)
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: req => String(req.user?.id || req.ip),
  handler: (_req, res) =>
    res.status(429).json({
      error: 'Too many orders in a short time. Please wait before placing another.',
      code: 'ORDER_RATE_LIMITED',
    }),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { otpLimiter, authLimiter, apiLimiter, orderLimiter };
