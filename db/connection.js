'use strict';

const mysql = require('mysql2/promise');

// ── TiDB Cloud / Cloud MySQL connection with SSL ───────────────────────────
//
// TiDB Cloud Serverless REQUIRES SSL on every connection.
// This file auto-detects cloud hosts and enables SSL automatically.
//
// Required .env values for TiDB Cloud:
//   DB_HOST=gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com
//   DB_PORT=4000
//   DB_USER=3jV5piZ9Jxrosf1.root
//   DB_PASSWORD=P8TLLbHDSSne1610
//   DB_NAME=palm_legacy
//   DB_SSL_REJECT_UNAUTHORIZED=false
//
// IMPORTANT: Whitelist your IP in TiDB Cloud → Security → IP Access List
//            (or add 0.0.0.0/0 to allow all IPs during development)

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT, 10) || 3306;

// Auto-enable SSL for any non-localhost host
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
const useSSL  = !isLocal || process.env.DB_SSL === 'true';

// DB_SSL_REJECT_UNAUTHORIZED=false is needed for TiDB Cloud's certificate
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const sslConfig = useSSL ? { rejectUnauthorized } : false;

const pool = mysql.createPool({
  host,
  port,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'palm_legacy',
  connectionLimit:    parseInt(process.env.DB_POOL_LIMIT, 10) || 10,
  waitForConnections: true,
  charset:            'utf8mb4',
  timezone:           '+05:30',
  decimalNumbers:     true,
  connectTimeout:     15000,
  ssl:                sslConfig,
});

pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL connected → ${host}:${port}/${process.env.DB_NAME} (SSL: ${useSSL ? 'ON' : 'OFF'})`);
    conn.release();
  })
  .catch(err => {
    console.error(`\n❌  MySQL connection failed: ${err.message}\n`);

    if (err.message.includes('insecure transport')) {
      console.error('    ─────────────────────────────────────────────────────────────');
      console.error('    FIX: Add this line to your .env file:');
      console.error('         DB_SSL_REJECT_UNAUTHORIZED=false');
      console.error('    ─────────────────────────────────────────────────────────────\n');

    } else if (err.message.includes('Access denied')) {
      console.error('    ─────────────────────────────────────────────────────────────');
      console.error('    FIX: Your IP is not whitelisted in TiDB Cloud.');
      console.error('    STEP 1 → https://tidbcloud.com → your cluster → Connect');
      console.error('    STEP 2 → IP Access List → Add IP → 0.0.0.0/0 → Save');
      console.error('    STEP 3 → Wait 30 seconds → restart node server.js');
      console.error('    ─────────────────────────────────────────────────────────────\n');

    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED')) {
      console.error('    ─────────────────────────────────────────────────────────────');
      console.error('    FIX: Cannot reach the database server.');
      console.error('    → For TiDB Cloud: DB_PORT must be 4000 (not 3306)');
      console.error('    → Whitelist your IP in TiDB Cloud → Security → IP Access List');
      console.error('    ─────────────────────────────────────────────────────────────\n');

    } else if (err.message.includes('Unknown database')) {
      console.error('    ─────────────────────────────────────────────────────────────');
      console.error(`    FIX: Database "${process.env.DB_NAME}" does not exist.`);
      console.error('    → In TiDB Cloud SQL Editor run:');
      console.error(`      CREATE DATABASE ${process.env.DB_NAME};`);
      console.error('    → Then import your schema.sql');
      console.error('    ─────────────────────────────────────────────────────────────\n');

    } else {
      console.error('    → Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT in .env\n');
    }
  });

module.exports = pool;