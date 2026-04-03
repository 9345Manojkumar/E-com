// middleware/auth.js — Palm Legacy v3.1
// JWT verification and role-based access guards
'use strict';

const jwt      = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

// ─── Verify Bearer token ───────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer '))
    return next(new AppError('Authentication required. Please sign in.', 401, 'NO_TOKEN'));

  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch (err) {
    // TokenExpiredError / JsonWebTokenError are caught by errorHandler
    next(err);
  }
}

// ─── Admin or Manager only ─────────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (!req.user || !['admin', 'manager'].includes(req.user.role))
    return next(new AppError('Admin or Manager access required.', 403, 'FORBIDDEN'));
  next();
}

// ─── Flexible role check ───────────────────────────────────────────────────
// Usage: roleCheck('admin', 'manager', 'viewer')
function roleCheck(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError('You do not have permission for this action.', 403, 'FORBIDDEN'));
    next();
  };
}

// ─── Ownership guard (customer can only touch their own records) ───────────
// Usage: ownerOrAdmin('user_id') — checks req.params.userId or body.user_id
function ownerOrAdmin(userIdParam = 'id') {
  return (req, res, next) => {
    const resourceUserId = parseInt(req.params[userIdParam] || req.body[userIdParam], 10);
    const isOwner = req.user?.id === resourceUserId;
    const isStaff = ['admin', 'manager'].includes(req.user?.role);
    if (!isOwner && !isStaff)
      return next(new AppError('You can only access your own records.', 403, 'FORBIDDEN'));
    next();
  };
}

module.exports = { auth, adminOnly, roleCheck, ownerOrAdmin };
