// server.js — Palm Legacy Backend v3.1
// Step 1 changes:
//   ✅ asyncHandler on every route (no more unhandled promise rejections)
//   ✅ Centralised error handler (errorHandler.js)
//   ✅ Helmet security headers
//   ✅ CORS locked to ALLOWED_ORIGIN env var in production
//   ✅ Global + per-route rate limiting
//   ✅ Cryptographically secure OTP (crypto.randomInt)
//   ✅ OTPs hashed with bcrypt before storage
//   ✅ is_active ternary bug fixed (was always 1)
//   ✅ Inventory column names aligned to schema (qty, txn_ref, direction, uom_id)
//   ✅ Inventory txn_type ENUM aligned to schema
//   ✅ Promo usage tracked on every order (promo_usage + used_count)
//   ✅ /health endpoint added
//   ✅ PORT default 4000 (was 3000)
'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── .env loading ──────────────────────────────────────────────────────────
const envFile = ['.env', '.env.example']
  .map(f => path.join(__dirname, f))
  .find(f => fs.existsSync(f));

if (envFile) {
  require('dotenv').config({ path: envFile });
  console.log('📄  Loaded env from:', envFile);
} else {
  console.log('ℹ️   No .env file — using environment variables from system (Render/Railway).');
}

const env = k => (process.env[k] || '').trim();

if (!env('JWT_SECRET')) {
  console.warn('⚠️  JWT_SECRET not set — using temporary key. Set it in production!');
  process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
}

// ── dependencies ──────────────────────────────────────────────────────────
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('./db/connection');

// ── project middleware ────────────────────────────────────────────────────
const { asyncHandler, AppError, errorHandler } = require('./middleware/errorHandler');
const shiprocket = require('./services/shiprocket');
const { auth, adminOnly }                       = require('./middleware/auth');
const { otpLimiter, authLimiter, apiLimiter, orderLimiter } = require('./middleware/rateLimiter');
const { validateBody, patterns, trim, posDec }  = require('./middleware/validate');

const app  = express();
const PORT = parseInt(env('PORT'), 10) || 4000;
const JWT  = env('JWT_SECRET'); // read after dotenv / process.env is set

// ── trust proxy ───────────────────────────────────────────────────────────
// REQUIRED on Render, Railway, Heroku, Vercel — any platform that sits
// behind a reverse proxy / load balancer.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// and every login/OTP request fails before reaching the route handler.
//
// 'loopback'  = trust localhost proxy (local dev with nginx)
// 1           = trust 1 hop (Render, Railway, Heroku)
// true        = trust all (only for debugging — insecure in production)
//
// We read TRUST_PROXY from .env so you can tune per environment:
//   local dev:   TRUST_PROXY=false  (or leave unset — defaults to 1)
//   Render:      TRUST_PROXY=1
//   behind nginx:TRUST_PROXY=loopback
const trustProxyEnv = process.env.TRUST_PROXY;
const trustProxy = trustProxyEnv === 'false' ? false
                 : trustProxyEnv === 'true'  ? true
                 : trustProxyEnv === 'loopback' ? 'loopback'
                 : trustProxyEnv ? parseInt(trustProxyEnv, 10) || 1
                 : 1;   // default: trust 1 hop — works on Render/Railway/Heroku
app.set('trust proxy', trustProxy);

// ── security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:    false, // SPA has inline scripts
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────
// Set ALLOWED_ORIGIN=https://yourdomain.com in production .env
const corsOrigin = env('ALLOWED_ORIGIN') || '*';
app.use(cors({
  origin:       corsOrigin,
  methods:      ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ── body parser ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));

// ── global rate limiter (all /api/* routes) ───────────────────────────────
app.use('/api/', apiLimiter);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'palm-legacy', version: '3.1.0', ts: new Date().toISOString() })
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function makeToken(user) {
  const name = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return jwt.sign(
    { id: user.id, name, email: user.email, mobile: user.mobile, role: user.role },
    env('JWT_SECRET'),
    { expiresIn: '7d' }
  );
}

// ✅ FIX: crypto.randomInt instead of Math.random (cryptographically secure)
function generateOTP() {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

// ═══════════════════════════════════════════════════════════════════════════
// OTP — Channel 1: SMS via MSG91
// .env: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID  |  https://msg91.com
// ═══════════════════════════════════════════════════════════════════════════
async function sendSMS(mobile, otp) {
  const key = env('MSG91_AUTH_KEY');
  const tid = env('MSG91_TEMPLATE_ID');
  if (!key || !tid) {
    console.log(`[SMS] Not configured — OTP for ${mobile}: ${otp}`);
    return { success: false, reason: 'MSG91 not configured' };
  }
  try {
    const resp = await fetch('https://api.msg91.com/api/v5/otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', authkey: key },
      body:    JSON.stringify({
        template_id: tid,
        mobile:      '91' + mobile.replace(/\D/g, '').slice(-10),
        otp,
      }),
    });
    const data = await resp.json();
    if (data.type === 'success') { console.log(`✅ SMS → ${mobile}`); return { success: true }; }
    throw new Error(data.message || JSON.stringify(data));
  } catch (e) {
    console.error(`SMS error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OTP — Channel 2: Email
//
// IMPORTANT — Render (and many cloud hosts) BLOCK outbound SMTP ports
// 25/465/587 by default to prevent spam abuse. This is a platform-level
// network rule, not a bug in this code — Gmail SMTP will ALWAYS time out
// on Render even with perfectly correct credentials.
//
// FIX: Resend (https://resend.com) sends email over a normal HTTPS POST
// request on port 443, which is never blocked. We try Resend first if
// configured; otherwise we fall back to SMTP (works fine for local dev).
//
// .env (pick ONE):
//   RESEND_API_KEY=re_xxxxxxxx        ← works on Render, free tier available
//   SMTP_HOST/PORT/USER/PASS/FROM     ← works locally, BLOCKED on Render
// ═══════════════════════════════════════════════════════════════════════════

function emailTemplate(otp, purpose) {
  const titles = { signup: 'Verify Your Account', login: 'Your Login OTP', reset: 'Password Reset OTP' };
  return `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;border:1px solid #e8d5a3;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#1B4D1E,#2d7a32);padding:28px;text-align:center">
      <h1 style="color:#D4940A;font-size:26px;margin:0">🌴 PALM LEGACY</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px">Pure Palm Jaggery from Tamil Nadu</p>
    </div>
    <div style="padding:32px;background:#fffef9;text-align:center">
      <h2 style="color:#1B4D1E;font-size:18px;margin:0 0 16px">${titles[purpose] || 'Your OTP'}</h2>
      <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#1B4D1E;background:#f5f0e8;border-radius:12px;padding:18px 24px;display:inline-block;margin:0 0 20px">${otp}</div>
      <p style="color:#555;font-size:14px;margin:0 0 8px">Valid for <strong>10 minutes</strong>. Do not share this with anyone.</p>
    </div>
    <div style="background:#f9f4ec;padding:14px;text-align:center;border-top:1px solid #e8d5a3">
      <p style="color:#aaa;font-size:11px;margin:0">© Palm Legacy · Pure Palm Jaggery · Tamil Nadu</p>
    </div>
  </div>`;
}

// Send via Resend's HTTPS API — works on Render, Railway, any host.
async function sendEmailViaResend(toEmail, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || process.env.SMTP_FROM || 'Palm Legacy <onboarding@resend.dev>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [toEmail], subject, html }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || `Resend API error (${resp.status})`);
  return data;
}

// Send via SMTP/Nodemailer — works locally, BLOCKED on Render by default.
async function sendEmailViaSMTP(toEmail, subject, html) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error('SMTP not configured');
  const nm = require('nodemailer');
  const t = nm.createTransport({
    host: SMTP_HOST, port: parseInt(SMTP_PORT, 10) || 587,
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 8000, // fail fast instead of hanging for minutes
    greetingTimeout:   8000,
    socketTimeout:     8000,
  });
  await t.sendMail({ from: SMTP_FROM, to: toEmail, subject, html });
}

async function sendEmail(toEmail, otp, purpose = 'login') {
  if (!toEmail) return { success: false };
  const titles = { signup: 'Verify Your Account', login: 'Your Login OTP', reset: 'Password Reset OTP' };
  const subject = `Palm Legacy — ${titles[purpose] || 'OTP'}`;
  const html    = emailTemplate(otp, purpose);

  // Prefer Resend (HTTPS — works on Render). Fall back to SMTP (local dev).
  if (process.env.RESEND_API_KEY) {
    try {
      await sendEmailViaResend(toEmail, subject, html);
      console.log(`✅ Email (Resend) → ${toEmail}`);
      return { success: true, via: 'resend' };
    } catch (e) {
      // Resend's sandbox sender (onboarding@resend.dev) can ONLY deliver to
      // the email address you signed up to Resend with — this is a Resend
      // account restriction, not a bug. Detect it and stop immediately
      // instead of wasting time falling through to SMTP (also blocked here).
      const isSandboxRestriction = e.message.includes('only send testing emails')
                                 || e.message.includes('verify a domain');
      if (isSandboxRestriction) {
        console.error(`Resend error: ${e.message}`);
        console.error('    → You are using Resend\'s sandbox sender (onboarding@resend.dev),');
        console.error('      which can only deliver to your OWN Resend account email.');
        console.error('    → FIX: verify a real domain at https://resend.com/domains (takes 5 min,');
        console.error('      free) then set RESEND_FROM=Palm Legacy <no-reply@yourdomain.com> in .env');
        return { success: false, error: e.message, reason: 'resend_sandbox_restriction' };
      }
      console.error(`Resend error: ${e.message} — falling back to SMTP if configured`);
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await sendEmailViaSMTP(toEmail, subject, html);
      console.log(`✅ Email (SMTP) → ${toEmail}`);
      return { success: true, via: 'smtp' };
    } catch (e) {
      console.error(`Email error: ${e.message}`);
      if (e.message.includes('Timeout') || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET')
        console.error('    → SMTP ports (587/465/25) are blocked on Render and most cloud hosts.');
      console.error('    → Add RESEND_API_KEY in your .env / Render dashboard to fix this permanently.');
      return { success: false, error: e.message };
    }
  }

  console.log(`[EMAIL] Not configured — OTP for ${toEmail}: ${otp}`);
  return { success: false, reason: 'No email provider configured' };
}

// ═══════════════════════════════════════════════════════════════════════════
// OTP — Channel 3: WhatsApp (WATI / Twilio / Gupshup — first configured wins)
// ═══════════════════════════════════════════════════════════════════════════
async function sendWhatsApp(mobile, otp) {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  const intl  = '+91' + clean;

  if (env('WATI_API_URL') && env('WATI_ACCESS_TOKEN')) {
    try {
      const resp = await fetch(
        `${env('WATI_API_URL')}/api/v1/sendTemplateMessage?whatsappNumber=${clean}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: env('WATI_ACCESS_TOKEN') },
          body: JSON.stringify({
            template_name:  env('WATI_TEMPLATE_NAME') || 'otp_message',
            broadcast_name: 'otp_' + Date.now(),
            parameters: [{ name: 'otp', value: otp }, { name: 'validity', value: '10 minutes' }],
          }),
        }
      );
      const data = await resp.json();
      if (data.result !== false) { console.log(`✅ WhatsApp (WATI) → ${clean}`); return { success: true }; }
      throw new Error(data.info || JSON.stringify(data));
    } catch (e) { console.error(`WhatsApp WATI error: ${e.message}`); }
  }

  if (env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN')) {
    try {
      const client = require('twilio')(env('TWILIO_ACCOUNT_SID'), env('TWILIO_AUTH_TOKEN'));
      await client.messages.create({
        from: env('TWILIO_WHATSAPP_FROM'),
        to:   'whatsapp:' + intl,
        body: `Your Palm Legacy OTP is: *${otp}*\nValid for 10 minutes. Do not share this. 🌴`,
      });
      console.log(`✅ WhatsApp (Twilio) → ${intl}`);
      return { success: true };
    } catch (e) { console.error(`WhatsApp Twilio error: ${e.message}`); }
  }

  if (env('GUPSHUP_API_KEY') && env('GUPSHUP_SRC_NAME')) {
    try {
      const params = new URLSearchParams({
        channel: 'whatsapp', source: env('GUPSHUP_SRC_NAME'),
        destination: '91' + clean, 'src.name': env('GUPSHUP_SRC_NAME'),
        message: JSON.stringify({ isHSM: 'true', id: env('GUPSHUP_TEMPLATE_ID') || '', params: [otp] }),
      });
      const resp = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: env('GUPSHUP_API_KEY') },
        body:    params.toString(),
      });
      const data = await resp.json();
      if (data.status === 'submitted') { console.log(`✅ WhatsApp (Gupshup) → ${clean}`); return { success: true }; }
      throw new Error(JSON.stringify(data));
    } catch (e) { console.error(`WhatsApp Gupshup error: ${e.message}`); }
  }

  console.log(`[WhatsApp] Not configured — OTP for ${intl}: ${otp}`);
  return { success: false, reason: 'No WhatsApp provider configured' };
}

// Dispatch all OTP channels concurrently in background — never blocks the response
function dispatchOTP(mobile, email, otp, purpose) {
  const tasks = [];
  if (mobile) { tasks.push(sendSMS(mobile, otp)); tasks.push(sendWhatsApp(mobile, otp)); }
  if (email)  { tasks.push(sendEmail(email, otp, purpose)); }
  Promise.allSettled(tasks).then(results =>
    results.forEach(r => r.status === 'rejected' && console.error('OTP channel error:', r.reason))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/check-exists', asyncHandler(async (req, res) => {
  const { mobile, email } = req.body;
  const [byMobile] = await db.query('SELECT id FROM users WHERE mobile=? LIMIT 1', [mobile || '__none__']);
  const [byEmail]  = await db.query('SELECT id FROM users WHERE email=? LIMIT 1',  [email  || '__none__']);
  res.json({ mobileExists: byMobile.length > 0, emailExists: byEmail.length > 0 });
}));

app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password)
    throw new AppError('Mobile/email and password are required.', 400);

  const t = identifier.trim();
  const [rows] = await db.query(
    'SELECT * FROM users WHERE (email=? OR mobile=?) AND is_active=1 LIMIT 1',
    [t.toLowerCase(), t.replace(/\D/g, '')]
  );
  if (!rows.length) throw new AppError('No account found with this mobile/email.', 401);

  const user = rows[0];
  if (!await bcrypt.compare(password, user.password_hash))
    throw new AppError('Incorrect password.', 401);

  await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);
  const name = `${user.first_name} ${user.last_name || ''}`.trim();
  res.json({
    token: makeToken({ ...user, name }),
    user:  { id: user.id, name, email: user.email, mobile: user.mobile, role: user.role },
  });
}));

app.post('/api/auth/signup', authLimiter, asyncHandler(async (req, res) => {
  const { first_name, last_name, email, mobile, password } = req.body;
  if (!first_name || !mobile || !password)
    throw new AppError('first_name, mobile, and password are required.', 400);
  if (password.length < 8)
    throw new AppError('Password must be at least 8 characters.', 400);

  const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(cleanMobile))
    throw new AppError('Please enter a valid 10-digit Indian mobile number.', 400);

  const [ex] = await db.query(
    'SELECT id FROM users WHERE mobile=? OR email=? LIMIT 1',
    [cleanMobile, email || '__none__']
  );
  if (ex.length) throw new AppError('An account already exists with this mobile/email.', 409);

  const hash = await bcrypt.hash(password, 12);
  const [r]  = await db.query(
    'INSERT INTO users (first_name,last_name,email,mobile,password_hash,role,is_active) VALUES (?,?,?,?,?,?,1)',
    [trim(first_name, 100), trim(last_name || '', 100), email?.toLowerCase() || '', cleanMobile, hash, 'customer']
  );
  const user = {
    id: r.insertId,
    name: `${first_name} ${last_name || ''}`.trim(),
    email: email || '',
    mobile: cleanMobile,
    role: 'customer',
  };
  res.status(201).json({ token: makeToken(user), user });
}));

// ✅ FIX: rate-limited, and OTP is now bcrypt-hashed before storage
app.post('/api/auth/send-otp', otpLimiter, asyncHandler(async (req, res) => {
  const { identifier, email: bodyEmail, purpose = 'login' } = req.body;
  if (!identifier) throw new AppError('identifier is required.', 400);

  const validPurposes = ['login', 'signup', 'reset'];
  if (!validPurposes.includes(purpose))
    throw new AppError(`purpose must be one of: ${validPurposes.join(', ')}.`, 400);

  const plainOTP = generateOTP();
  // ✅ Hash OTP before storage — plain OTP only goes out via SMS/email/WhatsApp
  const hashedOTP = await bcrypt.hash(plainOTP, 8); // cost 8: fast enough for short-lived OTPs
  const exp = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidate previous unused OTPs for same identifier + purpose
  await db.query(
    'UPDATE auth_otps SET is_used=1 WHERE identifier=? AND purpose=? AND is_used=0',
    [identifier, purpose]
  );
  await db.query(
    'INSERT INTO auth_otps (identifier,otp_code,purpose,expires_at,ip_address) VALUES (?,?,?,?,?)',
    [identifier, hashedOTP, purpose, exp, req.ip]
  );

  // Resolve mobile + email from identifier.
  // For SIGNUP, the user doesn't exist in the DB yet, so a DB lookup
  // returns nothing — we must trust the email passed directly in the
  // request body (bodyEmail) instead of relying only on a DB join.
  // For LOGIN/RESET, the user already exists, so we still try the DB
  // lookup as a convenience (e.g. mobile-only login still emails them
  // if they have an email on file).
  const isMobile = /^[6-9]\d{9}$/.test(identifier.replace(/\D/g, ''));
  let mobile = null, email = null;

  if (isMobile) {
    mobile = identifier.replace(/\D/g, '');
    const [r] = await db.query('SELECT email FROM users WHERE mobile=? LIMIT 1', [mobile]);
    email = (r.length && r[0].email) ? r[0].email : (bodyEmail || null);
  } else {
    email = identifier;
    const [r] = await db.query('SELECT mobile FROM users WHERE email=? LIMIT 1', [identifier]);
    if (r.length && r[0].mobile) mobile = r[0].mobile;
  }

  // If caller explicitly passed an email and we still don't have one
  // (covers any edge case above), fall back to it.
  if (!email && bodyEmail) email = bodyEmail;

  dispatchOTP(mobile, email, plainOTP, purpose);
  const channels = [...(mobile ? ['SMS', 'WhatsApp'] : []), ...(email ? ['Email'] : [])];
  res.json({ message: `OTP sent via ${channels.join(', ')}` });
}));

// ✅ FIX: bcrypt.compare instead of SQL equality (OTPs are now hashed)
app.post('/api/auth/verify-otp', asyncHandler(async (req, res) => {
  const { identifier, otp, purpose = 'login' } = req.body;
  if (!identifier || !otp) throw new AppError('identifier and otp are required.', 400);

  // Fetch the latest valid (unused, unexpired) OTP row — do NOT filter by otp_code in SQL
  const [rows] = await db.query(
    `SELECT * FROM auth_otps
     WHERE identifier=? AND purpose=? AND is_used=0 AND expires_at>NOW()
     ORDER BY id DESC LIMIT 1`,
    [identifier, purpose]
  );

  // ✅ Compare submitted OTP against stored bcrypt hash
  const valid = rows.length && await bcrypt.compare(otp, rows[0].otp_code);
  if (!valid)
    throw new AppError('Invalid or expired OTP. Please request a new one.', 401, 'INVALID_OTP');

  await db.query('UPDATE auth_otps SET is_used=1 WHERE id=?', [rows[0].id]);

  // For login/signup — return a token so the frontend can sign in immediately
  if (purpose === 'login' || purpose === 'signup') {
    const [users] = await db.query(
      'SELECT * FROM users WHERE (mobile=? OR email=?) AND is_active=1 LIMIT 1',
      [identifier.replace(/\D/g, ''), identifier]
    );
    if (users.length) {
      const u    = users[0];
      const name = `${u.first_name} ${u.last_name || ''}`.trim();
      await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [u.id]);
      return res.json({
        message:  'OTP verified',
        verified: true,
        token:    makeToken({ ...u, name }),
        user:     { id: u.id, name, email: u.email, mobile: u.mobile, role: u.role },
      });
    }
  }

  res.json({ message: 'OTP verified', verified: true });
}));

app.post('/api/auth/reset-request', authLimiter, asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) throw new AppError('Mobile or email is required.', 400);

  const [rows] = await db.query(
    'SELECT * FROM users WHERE (mobile=? OR email=?) AND is_active=1 LIMIT 1',
    [identifier.replace(/\D/g, ''), identifier]
  );
  if (!rows.length) throw new AppError('No account found with this mobile/email.', 404);

  const user    = rows[0];
  const plainOTP = generateOTP();
  const hashedOTP = await bcrypt.hash(plainOTP, 8);
  const exp = new Date(Date.now() + 10 * 60 * 1000);

  await db.query("UPDATE auth_otps SET is_used=1 WHERE identifier=? AND purpose='reset' AND is_used=0", [identifier]);
  await db.query(
    'INSERT INTO auth_otps (identifier,otp_code,purpose,expires_at,ip_address) VALUES (?,?,?,?,?)',
    [identifier, hashedOTP, 'reset', exp, req.ip]
  );

  dispatchOTP(user.mobile, user.email, plainOTP, 'reset');
  const isMobile = /^[6-9]\d{9}$/.test(identifier.replace(/\D/g, ''));
  const target   = isMobile
    ? `+91 XXXXXX${user.mobile?.slice(-4)}`
    : user.email?.replace(/(.{2}).*@/, '$1***@');

  res.json({ message: 'Reset OTP sent', target });
}));

app.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword)
    throw new AppError('identifier, otp, and newPassword are required.', 400);
  if (newPassword.length < 8)
    throw new AppError('New password must be at least 8 characters.', 400);

  const [rows] = await db.query(
    "SELECT * FROM auth_otps WHERE identifier=? AND purpose='reset' AND is_used=0 AND expires_at>NOW() ORDER BY id DESC LIMIT 1",
    [identifier]
  );

  const valid = rows.length && await bcrypt.compare(otp, rows[0].otp_code);
  if (!valid) throw new AppError('Invalid or expired OTP.', 401, 'INVALID_OTP');

  await db.query('UPDATE auth_otps SET is_used=1 WHERE id=?', [rows[0].id]);
  const hash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE users SET password_hash=? WHERE mobile=? OR email=?', [hash, identifier, identifier]);
  res.json({ message: 'Password updated successfully.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RAZORPAY PAYMENT
// .env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  |  https://razorpay.com
// ═══════════════════════════════════════════════════════════════════════════
function getRazorpay() {
  const Razorpay = (() => { try { return require('razorpay'); } catch { return null; } })();
  if (!Razorpay) throw new AppError('razorpay not installed. Run: npm install razorpay', 500);
  if (!env('RAZORPAY_KEY_ID') || !env('RAZORPAY_KEY_SECRET'))
    throw new AppError('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env', 500);
  return new Razorpay({ key_id: env('RAZORPAY_KEY_ID'), key_secret: env('RAZORPAY_KEY_SECRET') });
}

app.get('/api/payment/config', (_req, res) => {
  const key = env('RAZORPAY_KEY_ID');
  if (!key) console.warn('[PAYMENT] RAZORPAY_KEY_ID not set — online payments disabled');
  res.json({ key, enabled: !!key });
});

// ✅ FIX: asyncHandler added (was missing — uncaught errors crashed the process)
app.post('/api/payment/create-order', auth, asyncHandler(async (req, res) => {
  const { amount, currency = 'INR', notes = {} } = req.body;
  if (!amount || amount <= 0) throw new AppError('A valid amount is required.', 400);
  const rz    = getRazorpay();
  const order = await rz.orders.create({
    amount:  Math.round(amount * 100),
    currency,
    receipt: 'rcpt_' + Date.now(),
    notes:   { user_id: req.user.id, ...notes },
  });
  res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key: env('RAZORPAY_KEY_ID') });
}));

app.post('/api/payment/verify', auth, asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    throw new AppError('order_id, payment_id, and signature are all required.', 400);
  if (!env('RAZORPAY_KEY_SECRET'))
    throw new AppError('RAZORPAY_KEY_SECRET is not set in .env.', 500);

  const generated = crypto
    .createHmac('sha256', env('RAZORPAY_KEY_SECRET'))
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generated !== razorpay_signature)
    throw new AppError('Invalid payment signature.', 400, 'SIGNATURE_MISMATCH');

  res.json({ verified: true, payment_id: razorpay_payment_id, order_id: razorpay_order_id });
}));

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/orders', auth, orderLimiter, asyncHandler(async (req, res) => {
  const {
    customer_name, customer_mobile, customer_email, delivery_address,
    city, state, pincode, payment_method, items,
    promo_code, grand_total, subtotal, delivery_charge, cod_charge,
    offer_discount, promo_discount, razorpay_payment_id, razorpay_order_id,
  } = req.body;

  if (!items?.length) throw new AppError('No items in order.', 400);
  if (!customer_name) throw new AppError('customer_name is required.', 400);
  if (!customer_mobile) throw new AppError('customer_mobile is required.', 400);
  if (!delivery_address) throw new AppError('delivery_address is required.', 400);

  const payment_status = payment_method === 'cod' ? 'pending' : 'paid';
  const pm_map = { upi:'upi', card:'card', cod:'cod', netbanking:'upi', wallet:'upi', online_dev:'upi' };
  const safe_pm = pm_map[payment_method] || 'upi';

  // Order number format: F + YY + DD + MM + 6-digit zero-padded MySQL row id
  // e.g. F262803000001  (year=26, day=28, month=03, seq=000001)
  // We insert a temp placeholder first, get the auto-increment id, then format and update.
  function formatOrderNumber(id) {
    const now = new Date();
    const yy  = String(now.getFullYear()).slice(-2);        // "26"
    const dd  = String(now.getDate()).padStart(2, '0');     // "28"
    const mm  = String(now.getMonth() + 1).padStart(2, '0'); // "03"
    const seq = String(id).padStart(6, '0');                // "000001"
    return `F${yy}${dd}${mm}${seq}`;
  }

  let orderId, order_number;
  try {
    const [r] = await db.query(
      `INSERT INTO orders
         (order_number,user_id,customer_name,customer_email,customer_mobile,
          delivery_address,city,state,pincode,subtotal,offer_discount,promo_discount,promo_code,
          delivery_charge,cod_charge,grand_total,payment_method,payment_status,
          razorpay_payment_id,razorpay_order_id,order_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        'TEMP', req.user.id, trim(customer_name, 200), customer_email || '', customer_mobile,
        trim(delivery_address, 300), city || '', state || '', pincode || '',
        subtotal || 0, offer_discount || 0, promo_discount || 0, promo_code || null,
        delivery_charge || 0, cod_charge || 0, grand_total, safe_pm, payment_status,
        razorpay_payment_id || null, razorpay_order_id || null, 'pending',
      ]
    );
    orderId = r.insertId;
    order_number = formatOrderNumber(orderId);
    await db.query('UPDATE orders SET order_number=? WHERE id=?', [order_number, orderId]);
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      // Razorpay columns missing — insert without them
      const [r] = await db.query(
        `INSERT INTO orders
           (order_number,user_id,customer_name,customer_email,customer_mobile,
            delivery_address,city,state,pincode,subtotal,offer_discount,promo_discount,promo_code,
            delivery_charge,cod_charge,grand_total,payment_method,payment_status,order_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          'TEMP', req.user.id, trim(customer_name, 200), customer_email || '', customer_mobile,
          trim(delivery_address, 300), city || '', state || '', pincode || '',
          subtotal || 0, offer_discount || 0, promo_discount || 0, promo_code || null,
          delivery_charge || 0, cod_charge || 0, grand_total, safe_pm, payment_status, 'pending',
        ]
      );
      orderId = r.insertId;
      order_number = formatOrderNumber(orderId);
      await db.query('UPDATE orders SET order_number=? WHERE id=?', [order_number, orderId]);
    } else {
      throw e;
    }
  }

  // Insert order items + reduce stock
  for (const i of items) {
    await db.query(
      'INSERT INTO order_items (order_id,product_id,product_name,product_qty,product_uom,unit_price,mrp,quantity,line_total) VALUES (?,?,?,?,?,?,?,?,?)',
      [orderId, i.id, i.name, i.qty, i.uom || '', i.price, i.mrp || i.price, i.qty, i.price * i.qty]
    );
    await db.query('UPDATE products SET stock=GREATEST(0,stock-?) WHERE id=?', [i.qty, i.id]).catch(() => {});
  }

  // ✅ FIX: Track promo code usage (was never recorded before)
  if (promo_code) {
    const [promo] = await db.query(
      "SELECT id FROM pricing_policies WHERE code=? AND type='promo' AND is_active=1 LIMIT 1",
      [promo_code]
    );
    if (promo.length) {
      await db.query(
        'INSERT INTO promo_usage (policy_id,user_id,order_id) VALUES (?,?,?)',
        [promo[0].id, req.user.id, orderId]
      ).catch(() => {}); // don't fail the order if promo tracking fails
      await db.query(
        'UPDATE pricing_policies SET used_count=used_count+1 WHERE id=?',
        [promo[0].id]
      ).catch(() => {});
    }
  }

  // Notifications (fire and forget)
  if (customer_mobile)
    sendWhatsApp(customer_mobile, `✅ Order Confirmed!\nOrder ID: ${order_number}\nTotal: ₹${grand_total}\nThank you for ordering from Palm Legacy 🌴`).catch(() => {});
  if (customer_email)
    sendOrderConfirmEmail(customer_email, customer_name, order_number, grand_total, items).catch(() => {});

  res.status(201).json({ order_number, order_id: orderId, message: 'Order placed', payment_status });
}));

async function sendOrderConfirmEmail(toEmail, name, orderNum, total, items) {
  if (!toEmail) return;
  const rows = items.map(i =>
    `<tr><td style="padding:6px 10px">${i.name}</td><td style="padding:6px 10px;text-align:center">${i.qty}</td><td style="padding:6px 10px;text-align:right">₹${(i.price * i.qty).toFixed(2)}</td></tr>`
  ).join('');
  const subject = `Order Confirmed — ${orderNum} | Palm Legacy`;
  const html = `<div style="font-family:Georgia,serif;max-width:600px;margin:auto;border:1px solid #e8d5a3;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#1B4D1E,#2d7a32);padding:28px;text-align:center"><h1 style="color:#D4940A;font-size:24px;margin:0">🌴 PALM LEGACY</h1></div>
    <div style="padding:28px;background:#fffef9">
      <h2 style="color:#1B4D1E;margin:0 0 16px">✅ Order Confirmed, ${name}!</h2>
      <p style="color:#555;margin:0 0 20px">Order <strong>${orderNum}</strong> placed successfully.</p>
      <table width="100%" style="border-collapse:collapse;border:1px solid #e8d5a3">
        <thead><tr style="background:#f5f0e8"><th style="padding:10px;text-align:left">Item</th><th style="padding:10px;text-align:center">Qty</th><th style="padding:10px;text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#f5f0e8;font-weight:bold"><td colspan="2" style="padding:10px">Order Total</td><td style="padding:10px;text-align:right">₹${total}</td></tr></tfoot>
      </table>
    </div></div>`;

  // Same dual-mode strategy as OTP emails: Resend (HTTPS) first, SMTP fallback.
  if (process.env.RESEND_API_KEY) {
    try { await sendEmailViaResend(toEmail, subject, html); return; }
    catch (e) { console.error('Resend order-confirm error:', e.message); }
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try { await sendEmailViaSMTP(toEmail, subject, html); }
    catch (e) { console.error('Order confirm email error:', e.message); }
  }
}

app.get('/api/orders/my', auth, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
            o.grand_total, o.ordered_at, o.picklist_no, o.invoice_no,
            o.awb_code, o.courier_name, o.tracking_url,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('name',product_name,'qty',quantity,'price',unit_price,'total',line_total))
             FROM order_items WHERE order_id=o.id) items
     FROM orders o WHERE o.user_id=? ORDER BY o.ordered_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

// Customer self-cancel (pending orders only)
app.patch('/api/orders/:id/cancel', auth, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    "SELECT id,user_id,order_status FROM orders WHERE id=? LIMIT 1",
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Order not found.', 404);
  if (rows[0].user_id !== req.user.id) throw new AppError('You can only cancel your own orders.', 403);
  if (rows[0].order_status !== 'pending') throw new AppError('Only pending orders can be cancelled.', 400);
  await db.query("UPDATE orders SET order_status='cancelled' WHERE id=?", [req.params.id]);
  res.json({ message: 'Order cancelled.' });
}));

app.get('/api/admin/orders', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    `SELECT o.*,u.first_name,u.last_name,
       (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) item_count
     FROM orders o LEFT JOIN users u ON o.user_id=u.id
     ORDER BY o.ordered_at DESC LIMIT 200`
  );
  res.json(rows);
}));

app.patch('/api/admin/orders/:id/status', auth, adminOnly, asyncHandler(async (req, res) => {
  const { order_status, payment_status } = req.body;
  if (order_status)   await db.query('UPDATE orders SET order_status=? WHERE id=?',   [order_status,   req.params.id]);
  if (payment_status) await db.query('UPDATE orders SET payment_status=? WHERE id=?', [payment_status, req.params.id]);

  // ── When status moves to "shipped" → push to Shiprocket automatically ──
  if (order_status === 'shipped' && shiprocket.isConfigured()) {
    pushToShiprocket(req.params.id).catch(e =>
      console.error(`Shiprocket push failed for order ${req.params.id}:`, e.message)
    );
  }

  res.json({ message: 'Status updated.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Users
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/admin/users', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    'SELECT id,first_name,last_name,email,mobile,role,is_active,created_at,last_login FROM users ORDER BY id DESC'
  );
  res.json(rows.map(u => ({ ...u, name: `${u.first_name} ${u.last_name || ''}`.trim() })));
}));

app.post('/api/admin/users', auth, adminOnly, asyncHandler(async (req, res) => {
  const { first_name, last_name, email, mobile, password, role = 'customer' } = req.body;
  if (!first_name || !mobile) throw new AppError('first_name and mobile are required.', 400);
  const hash = await bcrypt.hash(password || 'Welcome@123', 12);
  const [r]  = await db.query(
    'INSERT INTO users (first_name,last_name,email,mobile,password_hash,role,is_active) VALUES (?,?,?,?,?,?,1)',
    [trim(first_name, 100), trim(last_name || '', 100), email || '', mobile, hash, role]
  );
  res.status(201).json({ id: r.insertId });
}));

app.patch('/api/admin/users/:id/role',   auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE users SET role=? WHERE id=?', [req.body.role, req.params.id]);
  res.json({ message: 'Role updated.' });
}));
app.patch('/api/admin/users/:id/status', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE users SET is_active=? WHERE id=?', [req.body.is_active ? 1 : 0, req.params.id]);
  res.json({ message: 'Status updated.' });
}));

app.post('/api/admin/users/:id/reset-password', auth, adminOnly, asyncHandler(async (req, res) => {
  const tmp  = 'Temp' + Math.floor(100000 + Math.random() * 900000) + '!';
  const hash = await bcrypt.hash(tmp, 12);
  await db.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.id]);
  const [rows] = await db.query('SELECT mobile,email,first_name FROM users WHERE id=?', [req.params.id]);
  if (rows.length) {
    const { mobile, email, first_name } = rows[0];
    if (mobile) sendSMS(mobile, `Hi ${first_name}, your Palm Legacy temp password: ${tmp}`).catch(() => {});
    if (email)  sendEmail(email, tmp, 'reset').catch(() => {});
  }
  res.json({ message: 'Password reset.', temp_password: tmp });
}));

app.delete('/api/admin/users/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE users SET is_active=0 WHERE id=?', [req.params.id]);
  res.json({ message: 'User deactivated.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES / UOM
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/categories', asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM category_master ORDER BY sort_order,name');
  res.json(r);
}));
app.post('/api/admin/categories', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) throw new AppError('name is required.', 400);
  const [r] = await db.query('INSERT INTO category_master (name,icon,bg_color) VALUES (?,?,?)', [name, icon || '📦', color || '#FFF8E8']);
  res.status(201).json({ id: r.insertId });
}));
app.put('/api/admin/categories/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, icon, color } = req.body;
  await db.query('UPDATE category_master SET name=?,icon=?,bg_color=? WHERE id=?', [name, icon, color, req.params.id]);
  res.json({ message: 'Updated.' });
}));
app.delete('/api/admin/categories/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('DELETE FROM category_master WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted.' });
}));

app.get('/api/uom', asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM uom_master ORDER BY name');
  res.json(r);
}));
app.post('/api/admin/uom', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, short_code } = req.body;
  const [r] = await db.query('INSERT INTO uom_master (name,short_code) VALUES (?,?)', [name, short_code]);
  res.status(201).json({ id: r.insertId });
}));
app.put('/api/admin/uom/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, short_code } = req.body;
  await db.query('UPDATE uom_master SET name=?,short_code=? WHERE id=?', [name, short_code, req.params.id]);
  res.json({ message: 'Updated.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/products', asyncHandler(async (_req, res) => {
  const [products] = await db.query(
    `SELECT p.*,c.name cat_name,c.icon cat_icon,u.short_code uom_short
     FROM products p
     LEFT JOIN category_master c ON p.category_id=c.id
     LEFT JOIN uom_master u ON p.uom_id=u.id
     WHERE p.is_active=1 ORDER BY p.sort_order,p.name`
  );
  // Attach images for every product (was missing — caused images to
  // disappear from the shop/admin on every reload after save)
  if (products.length) {
    const ids = products.map(p => p.id);
    const [images] = await db.query(
      `SELECT * FROM product_images WHERE product_id IN (?) ORDER BY product_id, sort_order`,
      [ids]
    );
    const byProduct = {};
    for (const img of images) {
      (byProduct[img.product_id] ||= []).push(img);
    }
    for (const p of products) p.images = byProduct[p.id] || [];
  }
  res.json(products);
}));

app.get('/api/admin/products', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [products] = await db.query(
    `SELECT p.*,c.name cat_name,u.short_code uom_short
     FROM products p
     LEFT JOIN category_master c ON p.category_id=c.id
     LEFT JOIN uom_master u ON p.uom_id=u.id
     ORDER BY p.id DESC`
  );
  // Attach images for every product (was missing — caused images to
  // disappear from Product Master every time the admin list reloaded)
  if (products.length) {
    const ids = products.map(p => p.id);
    const [images] = await db.query(
      `SELECT * FROM product_images WHERE product_id IN (?) ORDER BY product_id, sort_order`,
      [ids]
    );
    const byProduct = {};
    for (const img of images) {
      (byProduct[img.product_id] ||= []).push(img);
    }
    for (const p of products) p.images = byProduct[p.id] || [];
  }
  res.json(products);
}));

app.post('/api/admin/products', auth, adminOnly, asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.name) throw new AppError('name is required.', 400);
  // Accept both old field names (selling_price/stock_units/quantity)
  // and new field names (price/stock/weight_grams) — whichever the client sends
  const name         = trim(b.name, 200);
  const description  = b.description  || '';
  const category_id  = b.category_id;
  const uom_id       = b.uom_id;
  const price        = parseFloat(b.price        || b.selling_price  || 0);
  const mrp          = parseFloat(b.mrp          || b.price || b.selling_price || 0);
  const weight_grams = parseFloat(b.weight_grams || b.quantity       || 0);
  const stock        = parseInt(  b.stock        || b.stock_units    || 0, 10);
  const badge_label  = b.badge_label || '';
  const is_bestseller= (b.is_bestseller === 1 || b.is_bestseller === true) ? 1 : 0;
  const is_active    = (b.is_active    === 0 || b.is_active    === false)  ? 0 : 1;
  const tags         = b.tags || '';
  // How many seconds each image shows before auto-advancing on the shop page.
  // null/0 = no auto-slide (manual prev/next only).
  const slide_interval_sec = b.slide_interval_sec ? parseFloat(b.slide_interval_sec) : null;

  const [r] = await db.query(
    `INSERT INTO products
       (name,description,category_id,uom_id,price,mrp,weight_grams,
        stock,badge_label,is_bestseller,is_active,tags,slide_interval_sec)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [name, description, category_id, uom_id, price, mrp, weight_grams,
     stock, badge_label, is_bestseller, is_active, tags, slide_interval_sec]
  );

  // Save images if provided
  const images = b.images || [];
  if (images.length) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img.src || img.image_url || '';
      if (src) {
        await db.query(
          'INSERT INTO product_images (product_id,image_url,is_primary,sort_order) VALUES (?,?,?,?)',
          [r.insertId, src, i === 0 ? 1 : 0, i]
        );
      }
    }
  } else if (b.image_url) {
    await db.query(
      'INSERT INTO product_images (product_id,image_url,is_primary) VALUES (?,?,1)',
      [r.insertId, b.image_url]
    );
  }

  res.status(201).json({ id: r.insertId, message: 'Product created.' });
}));

app.put('/api/admin/products/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const b = req.body;
  // Accept both old and new field names
  const name         = trim(b.name || '', 200);
  const description  = b.description  || '';
  const category_id  = b.category_id;
  const uom_id       = b.uom_id;
  const price        = parseFloat(b.price        || b.selling_price  || 0);
  const mrp          = parseFloat(b.mrp          || b.price || b.selling_price || 0);
  const weight_grams = parseFloat(b.weight_grams || b.quantity       || 0);
  const stock        = parseInt(  b.stock        || b.stock_units    || 0, 10);
  const badge_label  = b.badge_label || '';
  const is_bestseller= (b.is_bestseller === 1 || b.is_bestseller === true) ? 1 : 0;
  const is_active    = (b.is_active    === 0 || b.is_active    === false)  ? 0 : 1;
  const tags         = b.tags || '';
  const slide_interval_sec = b.slide_interval_sec ? parseFloat(b.slide_interval_sec) : null;

  await db.query(
    `UPDATE products
     SET name=?,description=?,category_id=?,uom_id=?,price=?,mrp=?,
         weight_grams=?,stock=?,badge_label=?,is_bestseller=?,is_active=?,tags=?,
         slide_interval_sec=?
     WHERE id=?`,
    [name, description, category_id, uom_id, price, mrp,
     weight_grams, stock, badge_label, is_bestseller, is_active, tags,
     slide_interval_sec, req.params.id]
  );

  // Update images if provided
  const images = b.images || [];
  if (images.length) {
    await db.query('DELETE FROM product_images WHERE product_id=?', [req.params.id]);
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img.src || img.image_url || '';
      if (src) {
        await db.query(
          'INSERT INTO product_images (product_id,image_url,is_primary,sort_order) VALUES (?,?,?,?)',
          [req.params.id, src, i === 0 ? 1 : (img.primary ? 1 : 0), i]
        );
      }
    }
  }

  res.json({ message: 'Updated.' });
}));

app.delete('/api/admin/products/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE products SET is_active=0 WHERE id=?', [req.params.id]);
  res.json({ message: 'Archived.' });
}));

app.get('/api/admin/products/:id/images', auth, adminOnly, asyncHandler(async (req, res) => {
  const [r] = await db.query('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order', [req.params.id]);
  res.json(r);
}));
app.post('/api/admin/products/:id/images', auth, adminOnly, asyncHandler(async (req, res) => {
  const { image_url, is_primary } = req.body;
  if (is_primary) await db.query('UPDATE product_images SET is_primary=0 WHERE product_id=?', [req.params.id]);
  const [r] = await db.query('INSERT INTO product_images (product_id,image_url,is_primary) VALUES (?,?,?)', [req.params.id, image_url, is_primary ? 1 : 0]);
  res.status(201).json({ id: r.insertId });
}));
app.delete('/api/admin/products/:id/images/:imgId', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('DELETE FROM product_images WHERE id=? AND product_id=?', [req.params.imgId, req.params.id]);
  res.json({ message: 'Deleted.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PRICING POLICIES
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/pricing', asyncHandler(async (_req, res) => {
  const [r] = await db.query("SELECT * FROM pricing_policies WHERE is_active=1 AND (valid_to IS NULL OR valid_to>=CURDATE()) ORDER BY created_at DESC");
  res.json(r);
}));
app.get('/api/admin/pricing', auth, asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM pricing_policies ORDER BY created_at DESC');
  res.json(r);
}));

app.post('/api/admin/pricing', auth, adminOnly, asyncHandler(async (req, res) => {
  const { type, name, code, discount_type, percent, override_price, cap_amount, scope, scope_id, min_order_amt, valid_from, valid_to, total_uses, per_user_limit, is_active } = req.body;
  // ✅ FIX: is_active ? 1 : 1  →  is_active ? 1 : 0
  const [r] = await db.query(
    'INSERT INTO pricing_policies (type,name,code,discount_type,percent,override_price,cap_amount,scope,scope_id,min_order_amt,valid_from,valid_to,total_uses,per_user_limit,is_active,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [type, name, code || null, discount_type, percent || null, override_price || null, cap_amount || null, scope || 'all', scope_id || null, min_order_amt || null, valid_from, valid_to, total_uses || null, per_user_limit || null, is_active ? 1 : 0, req.user.id]
  );
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/admin/pricing/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { type, name, code, discount_type, percent, override_price, cap_amount, scope, scope_id, min_order_amt, valid_from, valid_to, total_uses, per_user_limit, is_active } = req.body;
  await db.query(
    'UPDATE pricing_policies SET type=?,name=?,code=?,discount_type=?,percent=?,override_price=?,cap_amount=?,scope=?,scope_id=?,min_order_amt=?,valid_from=?,valid_to=?,total_uses=?,per_user_limit=?,is_active=? WHERE id=?',
    [type, name, code || null, discount_type, percent || null, override_price || null, cap_amount || null, scope || 'all', scope_id || null, min_order_amt || null, valid_from, valid_to, total_uses || null, per_user_limit || null, is_active ? 1 : 0, req.params.id]
  );
  res.json({ message: 'Updated.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// AR / AP TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/ar',  auth, asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM ar_transactions ORDER BY txn_date DESC LIMIT 200');
  res.json(r);
}));
app.post('/api/ar', auth, asyncHandler(async (req, res) => {
  const { txn_date, txn_type, party_name, ref_doc, debit_amt, credit_amt, payment_mode, due_date, status, notes } = req.body;
  const [r] = await db.query(
    'INSERT INTO ar_transactions (txn_date,txn_type,party_name,ref_doc,debit_amt,credit_amt,payment_mode,due_date,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [txn_date, txn_type, party_name, ref_doc || '', debit_amt || 0, credit_amt || 0, payment_mode || 'credit', due_date || null, status || 'posted', notes || '', req.user.id]
  );
  res.status(201).json({ id: r.insertId });
}));

app.get('/api/ap',  auth, asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM ap_transactions ORDER BY txn_date DESC LIMIT 200');
  res.json(r);
}));
app.post('/api/ap', auth, asyncHandler(async (req, res) => {
  const { txn_date, txn_type, party_name, ref_doc, debit_amt, credit_amt, payment_mode, due_date, status, notes } = req.body;
  const [r] = await db.query(
    'INSERT INTO ap_transactions (txn_date,txn_type,party_name,ref_doc,debit_amt,credit_amt,payment_mode,due_date,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [txn_date, txn_type, party_name, ref_doc || '', debit_amt || 0, credit_amt || 0, payment_mode || 'credit', due_date || null, status || 'posted', notes || '', req.user.id]
  );
  res.status(201).json({ id: r.insertId });
}));

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/inventory', auth, asyncHandler(async (_req, res) => {
  const [r] = await db.query(
    `SELECT p.id,p.name,p.stock,p.price,c.name cat_name
     FROM products p LEFT JOIN category_master c ON p.category_id=c.id
     WHERE p.is_active=1 ORDER BY p.stock ASC`
  );
  res.json(r);
}));

app.get('/api/inventory/transactions', auth, asyncHandler(async (_req, res) => {
  const [r] = await db.query(
    'SELECT t.*,p.name product_name FROM item_transactions t LEFT JOIN products p ON t.product_id=p.id ORDER BY t.txn_date DESC LIMIT 200'
  );
  res.json(r);
}));

// ✅ FIX: column name (quantity→qty), added txn_ref, direction, uom_id; ENUM values aligned to schema
app.post('/api/inventory/transactions', auth, asyncHandler(async (req, res) => {
  const { txn_date, txn_type, product_id, qty, uom_id, rate, ref_doc, notes, party_name, party_type } = req.body;

  if (!txn_date)   throw new AppError('txn_date is required.', 400);
  if (!txn_type)   throw new AppError('txn_type is required.', 400);
  if (!product_id) throw new AppError('product_id is required.', 400);
  if (!qty || qty <= 0) throw new AppError('qty must be a positive number.', 400);

  // Valid schema ENUM values for txn_type
  const validTypes = ['purchase','sale','purchase_return','sale_return','stock_in','stock_out','adjust'];
  if (!validTypes.includes(txn_type))
    throw new AppError(`txn_type must be one of: ${validTypes.join(', ')}.`, 400);

  // Derive stock direction from txn_type (or accept explicit override)
  const DIRECTION_MAP = {
    purchase: 'in', sale: 'out', purchase_return: 'out',
    sale_return: 'in', stock_in: 'in', stock_out: 'out', adjust: 'in',
  };
  const direction = req.body.direction || DIRECTION_MAP[txn_type];

  // Auto-generate a reference if not supplied
  const txn_ref = (ref_doc || req.body.txn_ref || `TXN-${Date.now()}`).slice(0, 50);

  // Resolve uom_id — fall back to first UOM if not provided
  let resolvedUomId = uom_id;
  if (!resolvedUomId) {
    const [uoms] = await db.query('SELECT id FROM uom_master LIMIT 1');
    resolvedUomId = uoms.length ? uoms[0].id : 1;
  }

  const [r] = await db.query(
    `INSERT INTO item_transactions
       (txn_ref,txn_type,direction,txn_date,product_id,qty,uom_id,rate,amount,
        party_name,party_type,ref_doc,notes,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      txn_ref, txn_type, direction, txn_date, product_id,
      qty, resolvedUomId, rate || 0, (rate || 0) * qty,
      party_name || '', party_type || 'internal',
      ref_doc || '', notes || '', req.user.id,
    ]
  );

  const delta = direction === 'in' ? qty : -qty;
  await db.query('UPDATE products SET stock=GREATEST(0,stock+?) WHERE id=?', [delta, product_id]);

  res.status(201).json({ id: r.insertId, direction, delta });
}));

// ═══════════════════════════════════════════════════════════════════════════
// HERO BANNERS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/banners', asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM hero_banners WHERE is_active=1 ORDER BY sort_order,id');
  res.json(r);
}));
app.get('/api/admin/banners', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM hero_banners ORDER BY sort_order,id');
  res.json(r);
}));
app.post('/api/admin/banners', auth, adminOnly, asyncHandler(async (req, res) => {
  const { image_url, tag, title, description, btn_text, btn_url, sort_order, is_active } = req.body;
  if (!image_url) throw new AppError('image_url is required.', 400);
  // ✅ FIX: is_active ? 1 : 1  →  is_active ? 1 : 0
  const [r] = await db.query(
    'INSERT INTO hero_banners (image_url,tag,title,description,btn_text,btn_url,sort_order,is_active,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
    [image_url, tag || '', title || '', description || '', btn_text || '', btn_url || null, sort_order || 0, is_active ? 1 : 0, req.user.id]
  );
  res.status(201).json({ id: r.insertId, message: 'Banner created.' });
}));
app.patch('/api/admin/banners/:id/toggle', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE hero_banners SET is_active=?,updated_at=NOW() WHERE id=?', [req.body.is_active ? 1 : 0, req.params.id]);
  res.json({ message: 'Updated.' });
}));
app.delete('/api/admin/banners/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('DELETE FROM hero_banners WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// USER ADDRESSES (was an orphaned table — now wired up)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/addresses', auth, asyncHandler(async (req, res) => {
  const [r] = await db.query('SELECT * FROM user_addresses WHERE user_id=? ORDER BY is_default DESC,id DESC', [req.user.id]);
  res.json(r);
}));
app.post('/api/addresses', auth, asyncHandler(async (req, res) => {
  const { label, address_line, city, state, pincode, is_default } = req.body;
  if (!address_line || !city || !state || !pincode) throw new AppError('address_line, city, state, pincode required.', 400);
  if (is_default) await db.query('UPDATE user_addresses SET is_default=0 WHERE user_id=?', [req.user.id]);
  const [r] = await db.query(
    'INSERT INTO user_addresses (user_id,label,address_line,city,state,pincode,is_default) VALUES (?,?,?,?,?,?,?)',
    [req.user.id, label || 'Home', trim(address_line, 300), trim(city, 100), trim(state, 100), pincode, is_default ? 1 : 0]
  );
  res.status(201).json({ id: r.insertId });
}));
app.patch('/api/addresses/:id/default', auth, asyncHandler(async (req, res) => {
  await db.query('UPDATE user_addresses SET is_default=0 WHERE user_id=?', [req.user.id]);
  await db.query('UPDATE user_addresses SET is_default=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Default address updated.' });
}));
app.delete('/api/addresses/:id', auth, asyncHandler(async (req, res) => {
  await db.query('DELETE FROM user_addresses WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Address deleted.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT REVIEWS (was an orphaned table — now wired up)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/products/:id/reviews', asyncHandler(async (req, res) => {
  const [r] = await db.query(
    'SELECT id,reviewer_name,city,rating,review_text,created_at FROM product_reviews WHERE product_id=? AND is_approved=1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(r);
}));
app.post('/api/products/:id/reviews', auth, asyncHandler(async (req, res) => {
  const { rating, review_text, city } = req.body;
  if (!rating || rating < 1 || rating > 5) throw new AppError('rating must be between 1 and 5.', 400);
  const [user] = await db.query('SELECT first_name,last_name FROM users WHERE id=?', [req.user.id]);
  const reviewer_name = user.length ? `${user[0].first_name} ${user[0].last_name || ''}`.trim() : 'Customer';
  const [r] = await db.query(
    'INSERT INTO product_reviews (product_id,user_id,reviewer_name,city,rating,review_text,is_approved) VALUES (?,?,?,?,?,?,0)',
    [req.params.id, req.user.id, reviewer_name, city || '', rating, review_text || '']
  );
  res.status(201).json({ id: r.insertId, message: 'Review submitted and pending approval.' });
}));
app.patch('/api/admin/reviews/:id/approve', auth, adminOnly, asyncHandler(async (req, res) => {
  await db.query('UPDATE product_reviews SET is_approved=1 WHERE id=?', [req.params.id]);
  // Update product rating + review_count
  await db.query(`
    UPDATE products p SET
      rating       = (SELECT ROUND(AVG(rating),2) FROM product_reviews WHERE product_id=p.id AND is_approved=1),
      review_count = (SELECT COUNT(*) FROM product_reviews WHERE product_id=p.id AND is_approved=1)
    WHERE p.id = (SELECT product_id FROM product_reviews WHERE id=?)`,
    [req.params.id]
  );
  res.json({ message: 'Review approved.' });
}));

// ═══════════════════════════════════════════════════════════════════════════
// NEWSLETTER (was an orphaned table — now wired up)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/newsletter/subscribe', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) throw new AppError('A valid email address is required.', 400);
  await db.query(
    'INSERT INTO newsletter_subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE is_active=1',
    [email.toLowerCase()]
  );
  res.json({ message: 'Subscribed successfully.' });
}));
app.post('/api/newsletter/unsubscribe', asyncHandler(async (req, res) => {
  const { email } = req.body;
  await db.query('UPDATE newsletter_subscribers SET is_active=0 WHERE email=?', [email?.toLowerCase()]);
  res.json({ message: 'Unsubscribed.' });
}));
app.get('/api/admin/newsletter/subscribers', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [r] = await db.query('SELECT * FROM newsletter_subscribers WHERE is_active=1 ORDER BY subscribed_at DESC');
  res.json(r);
}));

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/admin/analytics/summary', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [[rev]]   = await db.query("SELECT COALESCE(SUM(grand_total),0) total FROM orders WHERE payment_status='paid'");
  const [[ord]]   = await db.query('SELECT COUNT(*) cnt FROM orders');
  const [[users]] = await db.query("SELECT COUNT(*) cnt FROM users WHERE role='customer'");
  const [[pend]]  = await db.query("SELECT COUNT(*) cnt FROM orders WHERE order_status='pending'");
  res.json({ revenue: rev.total, orders: ord.cnt, customers: users.cnt, pending: pend.cnt });
}));
app.get('/api/admin/analytics/revenue', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    "SELECT DATE(ordered_at) d, SUM(grand_total) total FROM orders WHERE payment_status='paid' GROUP BY DATE(ordered_at) ORDER BY d DESC LIMIT 30"
  );
  res.json(rows);
}));


// ═══════════════════════════════════════════════════════════════════════════
// PICKLIST
// ═══════════════════════════════════════════════════════════════════════════

// Generate a picklist for one or more orders
// POST /api/admin/picklist/generate  { order_ids: [1, 2, 3] }
// If ALL selected orders already share the same picklist_no → return existing (reprint)
app.post('/api/admin/picklist/generate', auth, adminOnly, asyncHandler(async (req, res) => {
  const { order_ids } = req.body;
  if (!Array.isArray(order_ids) || !order_ids.length)
    throw new AppError('order_ids array is required.', 400);

  const ids = order_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (!ids.length) throw new AppError('No valid order IDs provided.', 400);

  // Check if all selected orders already share one picklist_no
  const [existing] = await db.query(
    `SELECT DISTINCT picklist_no FROM orders
     WHERE id IN (${ids.map(() => '?').join(',')}) AND picklist_no IS NOT NULL`,
    ids
  );
  const [unassigned] = await db.query(
    `SELECT COUNT(*) cnt FROM orders
     WHERE id IN (${ids.map(() => '?').join(',')}) AND picklist_no IS NULL`,
    ids
  );

  // All orders already on same picklist → reprint existing
  if (existing.length === 1 && unassigned[0].cnt === 0) {
    const plNo = existing[0].picklist_no;
    const [items] = await db.query(
      `SELECT o.id order_id, o.order_number, o.customer_name, o.customer_mobile,
              o.delivery_address, o.city, o.state, o.pincode,
              oi.product_name, oi.quantity, oi.product_uom, oi.unit_price, oi.line_total
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id IN (${ids.map(() => '?').join(',')})
       ORDER BY o.id, oi.id`,
      ids
    );
    return res.json({ picklist_no: plNo, order_count: ids.length, items, reprinted: true });
  }

  // Create new picklist for unassigned orders (orders already assigned keep their existing one)
  const [pl] = await db.query(
    'INSERT INTO picklists (picklist_no, created_by) VALUES (?, ?)',
    ['GENERATING', req.user.id]
  );
  const plId = pl.insertId;
  const plNo = 'PALM_' + String(plId).padStart(9, '0');
  await db.query('UPDATE picklists SET picklist_no=? WHERE id=?', [plNo, plId]);

  // Only assign picklist to orders that don't have one yet
  const newIds = ids; // assign to all selected (existing ones will be overwritten only if mixed)
  await db.query(
    `UPDATE orders SET picklist_no=? WHERE id IN (${newIds.map(() => '?').join(',')}) AND picklist_no IS NULL`,
    [plNo, ...newIds]
  );

  const [items] = await db.query(
    `SELECT o.id order_id, o.order_number, o.customer_name, o.customer_mobile,
            o.delivery_address, o.city, o.state, o.pincode,
            oi.product_name, oi.quantity, oi.product_uom, oi.unit_price, oi.line_total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id IN (${ids.map(() => '?').join(',')})
     ORDER BY o.id, oi.id`,
    ids
  );

  res.status(201).json({ picklist_no: plNo, picklist_id: plId, order_count: ids.length, items, reprinted: false });
}));

// Get all picklists
app.get('/api/admin/picklists', auth, adminOnly, asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, COUNT(o.id) order_count
     FROM picklists p
     LEFT JOIN orders o ON o.picklist_no = p.picklist_no
     GROUP BY p.id
     ORDER BY p.created_at DESC LIMIT 100`
  );
  res.json(rows);
}));


// ═══════════════════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════════════════

// Generate invoice for a shipped order
// POST /api/admin/invoice/generate  { order_id: 5 }
// Invoice number = INV_000000001 (auto-increment from invoices table)
// If invoice already exists → return it (reprint, no duplicate created)
app.post('/api/admin/invoice/generate', auth, adminOnly, asyncHandler(async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) throw new AppError('order_id is required.', 400);

  // Fetch order + items
  const [orders] = await db.query(
    `SELECT o.*, u.first_name, u.last_name
     FROM orders o LEFT JOIN users u ON o.user_id=u.id
     WHERE o.id=? LIMIT 1`,
    [order_id]
  );
  if (!orders.length) throw new AppError('Order not found.', 404);
  const order = orders[0];

  // If invoice already exists → reprint (return same invoice, no new record)
  if (order.invoice_no) {
    const [items] = await db.query(
      'SELECT * FROM order_items WHERE order_id=? ORDER BY id',
      [order_id]
    );
    return res.json({ invoice_no: order.invoice_no, order, items, reprinted: true });
  }

  // Invoice number: INV_000000001 — auto-increment from invoices table
  const [ins] = await db.query(
    'INSERT INTO invoices (invoice_no, order_id, picklist_no, generated_by) VALUES (?,?,?,?)',
    ['GENERATING', order_id, order.picklist_no || null, req.user.id]
  );
  const invNo = 'INV_' + String(ins.insertId).padStart(9, '0');
  await db.query('UPDATE invoices SET invoice_no=? WHERE id=?', [invNo, ins.insertId]);

  // Stamp invoice_no onto the order row
  await db.query('UPDATE orders SET invoice_no=? WHERE id=?', [invNo, order_id]);

  const [items] = await db.query(
    'SELECT * FROM order_items WHERE order_id=? ORDER BY id',
    [order_id]
  );

  res.status(201).json({ invoice_no: invNo, order: { ...order, invoice_no: invNo }, items, reprinted: false });
}));

// Bulk status update for multiple orders
// POST /api/admin/orders/bulk-status  { order_ids: [1,2,3], order_status: 'shipped' }
app.post('/api/admin/orders/bulk-status', auth, adminOnly, asyncHandler(async (req, res) => {
  const { order_ids, order_status } = req.body;
  if (!Array.isArray(order_ids) || !order_ids.length)
    throw new AppError('order_ids array is required.', 400);
  if (!order_status) throw new AppError('order_status is required.', 400);

  const ids = order_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  await db.query(
    `UPDATE orders SET order_status=? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [order_status, ...ids]
  );
  res.json({ message: `${ids.length} order(s) updated to ${order_status}.`, updated: ids.length });
}));


// ═══════════════════════════════════════════════════════════════════════════
// SHIPROCKET — Full flow (Steps 3–11 per official API docs)
// ═══════════════════════════════════════════════════════════════════════════

// Internal: push order through full Shiprocket flow
// Steps 4→5→6: Create order → Assign AWB → Generate pickup
async function pushToShiprocket(dbOrderId) {
  const [orders] = await db.query('SELECT * FROM orders WHERE id=? LIMIT 1', [dbOrderId]);
  if (!orders.length) throw new Error('Order not found: ' + dbOrderId);
  const order = orders[0];

  // Already fully pushed (has AWB) — skip
  if (order.awb_code) {
    console.log(`Shiprocket: order ${dbOrderId} already has AWB ${order.awb_code}`);
    return order;
  }

  const [items] = await db.query('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [dbOrderId]);

  // Step 4: Create order in Shiprocket
  let srOrderId = order.shiprocket_order_id;
  let srShipId  = order.shiprocket_shipment_id;
  if (!srOrderId) {
    const created = await shiprocket.createShiprocketOrder(order, items);
    srOrderId = created.shiprocket_order_id;
    srShipId  = created.shiprocket_shipment_id;
    await db.query('UPDATE orders SET shiprocket_order_id=?, shiprocket_shipment_id=? WHERE id=?',
      [srOrderId, srShipId, dbOrderId]);
    console.log(`✅ Shiprocket order created: ${srOrderId} / shipment: ${srShipId}`);
  }

  // Step 5: Assign courier + AWB
  if (srShipId) {
    try {
      const { awb_code, courier_name, tracking_url } = await shiprocket.assignCourier(srShipId);
      if (awb_code) {
        await db.query('UPDATE orders SET awb_code=?, courier_name=?, tracking_url=? WHERE id=?',
          [awb_code, courier_name, tracking_url, dbOrderId]);
        console.log(`✅ AWB assigned: ${awb_code} via ${courier_name}`);

        // Step 6: Generate pickup request (fire-and-forget)
        shiprocket.generatePickup(srShipId)
          .then(p => console.log(`✅ Pickup scheduled: ${p.message}`))
          .catch(e => console.warn('Pickup generation failed:', e.message));
      }
    } catch (e) {
      console.warn('AWB assignment failed (will retry on next poll):', e.message);
    }
  }
}

// GET /api/admin/orders/:id/tracking — live tracking (admin)
app.get('/api/admin/orders/:id/tracking', auth, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT id,awb_code,courier_name,tracking_url,shiprocket_order_id,shiprocket_shipment_id,order_status FROM orders WHERE id=? LIMIT 1',
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Order not found.', 404);
  const order = rows[0];

  if (!order.awb_code) {
    return res.json({
      tracked: false,
      message: shiprocket.isConfigured()
        ? 'AWB not yet assigned — push to Shiprocket first.'
        : 'Shiprocket not configured in .env',
      shiprocket_configured: shiprocket.isConfigured(),
    });
  }
  try {
    const tracking = await shiprocket.trackShipment(order.awb_code);
    if (tracking.delivered && order.order_status !== 'delivered') {
      await db.query("UPDATE orders SET order_status='delivered' WHERE id=?", [req.params.id]);
      console.log(`✅ Order ${req.params.id} auto-marked delivered`);
    }
    res.json({ tracked:true, awb_code:order.awb_code, courier_name:order.courier_name,
               tracking_url:order.tracking_url, ...tracking });
  } catch (e) {
    res.json({ tracked:false, awb_code:order.awb_code, message:e.message });
  }
}));

// GET /api/orders/:id/tracking — live tracking (customer — auth but not adminOnly)
app.get('/api/orders/:id/tracking', auth, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT id,user_id,awb_code,courier_name,tracking_url,order_status FROM orders WHERE id=? LIMIT 1',
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Order not found.', 404);
  const order = rows[0];
  // Customers can only track their own orders
  if (req.user.role === 'customer' && order.user_id !== req.user.id)
    throw new AppError('You can only track your own orders.', 403);

  if (!order.awb_code)
    return res.json({ tracked:false, message:'Shipment not yet dispatched. Check back soon!' });

  try {
    const tracking = await shiprocket.trackShipment(order.awb_code);
    if (tracking.delivered && order.order_status !== 'delivered')
      await db.query("UPDATE orders SET order_status='delivered' WHERE id=?", [req.params.id]);
    res.json({ tracked:true, awb_code:order.awb_code, courier_name:order.courier_name,
               tracking_url:order.tracking_url, ...tracking });
  } catch (e) {
    res.json({ tracked:false, awb_code:order.awb_code,
               message:'Tracking temporarily unavailable. Try again in a few minutes.' });
  }
}));

// POST /api/admin/orders/:id/push-shiprocket — manually push (Step 4+5+6)
app.post('/api/admin/orders/:id/push-shiprocket', auth, adminOnly, asyncHandler(async (req, res) => {
  if (!shiprocket.isConfigured()) throw new AppError('Shiprocket not configured in .env.', 400);
  await pushToShiprocket(req.params.id);
  const [rows] = await db.query(
    'SELECT shiprocket_order_id,shiprocket_shipment_id,awb_code,courier_name,tracking_url FROM orders WHERE id=? LIMIT 1',
    [req.params.id]
  );
  res.json({ message:'Pushed to Shiprocket.', ...rows[0] });
}));

// POST /api/admin/orders/:id/generate-pickup — Step 6 standalone
app.post('/api/admin/orders/:id/generate-pickup', auth, adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT shiprocket_shipment_id FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  if (!rows.length || !rows[0].shiprocket_shipment_id)
    throw new AppError('Push to Shiprocket first to get a shipment ID.', 400);
  const result = await shiprocket.generatePickup(rows[0].shiprocket_shipment_id);
  res.json(result);
}));

// POST /api/admin/orders/:id/generate-manifest — Step 7+8
app.post('/api/admin/orders/:id/generate-manifest', auth, adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT shiprocket_shipment_id,shiprocket_order_id FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  if (!rows.length || !rows[0].shiprocket_shipment_id)
    throw new AppError('Push to Shiprocket first.', 400);
  const gen   = await shiprocket.generateManifest(rows[0].shiprocket_shipment_id);
  const print = await shiprocket.printManifest(rows[0].shiprocket_order_id);
  res.json({ manifest_url: gen.manifest_url || print.manifest_url });
}));

// POST /api/admin/orders/:id/generate-label — Step 9
app.post('/api/admin/orders/:id/generate-label', auth, adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT shiprocket_shipment_id FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  if (!rows.length || !rows[0].shiprocket_shipment_id)
    throw new AppError('Push to Shiprocket first.', 400);
  const result = await shiprocket.generateLabel(rows[0].shiprocket_shipment_id);
  res.json(result);
}));

// POST /api/admin/orders/:id/shiprocket-invoice — Step 10
app.post('/api/admin/orders/:id/shiprocket-invoice', auth, adminOnly, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT shiprocket_order_id FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  if (!rows.length || !rows[0].shiprocket_order_id)
    throw new AppError('Push to Shiprocket first.', 400);
  const result = await shiprocket.printShiprocketInvoice(rows[0].shiprocket_order_id);
  res.json(result);
}));

// GET /api/admin/shiprocket/serviceability — Step 3 (check pincode)
app.get('/api/admin/shiprocket/serviceability', auth, adminOnly, asyncHandler(async (req, res) => {
  const { from, to, weight, cod } = req.query;
  if (!from || !to) throw new AppError('from and to pincode required.', 400);
  const result = await shiprocket.checkServiceability(from, to, parseFloat(weight)||0.5, parseInt(cod)||0);
  res.json(result);
}));

// POST /api/shiprocket/webhook — webhook from Shiprocket dashboard
app.post('/api/shiprocket/webhook', asyncHandler(async (req, res) => {
  const { awb, current_status } = req.body;
  console.log(`Shiprocket webhook: AWB=${awb} status=${current_status}`);
  if (awb && current_status) {
    const STATUS_MAP = {
      'Delivered':'delivered','RTO Delivered':'cancelled','Shipment Cancelled':'cancelled',
      'Cancellation Requested':'cancelled','Out For Delivery':'shipped','In Transit':'shipped',
      'Picked Up':'shipped','Pickup Scheduled':'processing','Pickup Error':'processing',
    };
    const newStatus = STATUS_MAP[current_status];
    if (newStatus)
      await db.query('UPDATE orders SET order_status=? WHERE awb_code=?', [newStatus, awb])
              .catch(e => console.error('Webhook DB error:', e.message));
    console.log(`Shiprocket webhook: AWB ${awb} → ${newStatus||'(unmapped)'}`);
  }
  res.json({ received:true });
}));

// GET /api/admin/shiprocket/status — config check for settings page
app.get('/api/admin/shiprocket/status', auth, adminOnly, (_req, res) => {
  res.json({
    configured:      shiprocket.isConfigured(),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    channel_id:      process.env.SHIPROCKET_CHANNEL_ID      || null,
    email:           process.env.SHIPROCKET_EMAIL            ? process.env.SHIPROCKET_EMAIL.replace(/(.{2}).*@/, '$1***@') : null,
  });
});

// Polling: auto-mark delivered every 30 min
async function pollShiprocketDeliveries() {
  if (!shiprocket.isConfigured()) return;
  try {
    const [shippedOrders] = await db.query(
      "SELECT id,awb_code FROM orders WHERE order_status='shipped' AND awb_code IS NOT NULL LIMIT 50"
    );
    for (const order of shippedOrders) {
      try {
        const t = await shiprocket.trackShipment(order.awb_code);
        if (t.delivered) {
          await db.query("UPDATE orders SET order_status='delivered' WHERE id=?", [order.id]);
          console.log(`✅ Poll: order ${order.id} (${order.awb_code}) marked delivered`);
        }
      } catch (_) { /* silent per order */ }
    }
  } catch (e) { console.warn('Shiprocket poll error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC FILES
// ═══════════════════════════════════════════════════════════════════════════
// Serve palm-legacy.html for root URL — BEFORE express.static
// so index.html doesn't intercept /
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'palm-legacy.html')));

// Static files — explicitly exclude index.html so it doesn't override /
app.use(express.static(__dirname, { index: false }));

// ─── 404 for unknown /api/* routes ────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/'))
    return next(new AppError(`Route not found: ${req.method} ${req.path}`, 404, 'NOT_FOUND'));
  next();
});

// ─── Central error handler (must be last) ────────────────────────────────
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════
// Cleanup expired OTPs on startup + every 6 hours (prevent table bloat)
async function cleanupExpiredOTPs() {
  try {
    const [r] = await db.query('DELETE FROM auth_otps WHERE expires_at < NOW() - INTERVAL 1 DAY');
    if (r.affectedRows > 0) console.log(`🧹 Cleaned up ${r.affectedRows} expired OTP(s).`);
  } catch (e) {
    console.warn('OTP cleanup failed:', e.message);
  }
}

app.listen(PORT, async () => {
  const bar = '─'.repeat(52);
  console.log(`\n🌴  Palm Legacy  v3.1 — Step 1: Security + Error Handling`);
  console.log(bar);
  console.log(`    ✅  Server running on port ${PORT}`);
  console.log(`    ✅  DB: ${env('DB_HOST') || 'localhost'}:${env('DB_PORT') || 3306}/${env('DB_NAME')}`);
  console.log(`    ✅  CORS origin: ${corsOrigin}`);
  console.log(bar);
  console.log(`\n    👉  http://localhost:${PORT}/palm-legacy.html\n`);
  console.log(bar);

  const checks = [
    [env('RESEND_API_KEY'),                  '✅  Email OTP  → Resend (works on Render)', null,
       env('SMTP_HOST') && env('SMTP_USER') ? '✅  Email OTP  → SMTP (local only — blocked on Render!)' : '⚠️   Email OTP   → add RESEND_API_KEY (recommended) or SMTP_HOST/USER/PASS'],
    [env('MSG91_AUTH_KEY'),                  '✅  SMS OTP    → MSG91', null,       '⚠️   SMS OTP     → add MSG91_AUTH_KEY / MSG91_TEMPLATE_ID'],
    [env('WATI_API_URL'),                    '✅  WhatsApp   → WATI',  null,       env('TWILIO_ACCOUNT_SID') ? '✅  WhatsApp   → Twilio' : env('GUPSHUP_API_KEY') ? '✅  WhatsApp   → Gupshup' : '⚠️   WhatsApp   → not configured'],
    [env('RAZORPAY_KEY_ID'),                 `✅  Razorpay   → ${env('RAZORPAY_KEY_ID')}`, null, '⚠️   Razorpay   → add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET'],
  ];
  for (const [cond, ok, detail, warn] of checks)
    console.log(`    ${cond ? ok + (detail ? `  (${detail})` : '') : warn}`);

  console.log(bar + '\n');

  await cleanupExpiredOTPs();
  setInterval(cleanupExpiredOTPs, 6 * 60 * 60 * 1000); // every 6 hours

  // Shiprocket delivery polling — every 30 minutes
  if (shiprocket.isConfigured()) {
    console.log('    ✅  Shiprocket  → configured (polling every 30 min)');
    setTimeout(pollShiprocketDeliveries, 5000); // first run 5s after boot
    setInterval(pollShiprocketDeliveries, 30 * 60 * 1000);
  } else {
    console.log('    ⚠️   Shiprocket  → not configured (add SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)');
  }
});