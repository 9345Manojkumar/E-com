'use strict';

const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

// ── Verify JWT on every protected route ───────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return next(new AppError('Authentication required. Please log in.', 401, 'NO_TOKEN'));

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return next(new AppError('Session expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
    next(new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN'));
  }
}

// ── Restrict to admin / manager / viewer staff roles ──────────────
function adminOnly(req, res, next) {
  if (!req.user)
    return next(new AppError('Not authenticated.', 401));
  if (!['admin', 'manager', 'viewer'].includes(req.user.role))
    return next(new AppError('Staff access required.', 403, 'FORBIDDEN'));
  next();
}

module.exports = { auth, adminOnly }; 