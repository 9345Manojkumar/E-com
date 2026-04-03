// db/connection.js
const path  = require('path');
const fs    = require('fs');

// Load .env — try .env first, fall back to .env.example
const envFile = ['.env', '.env.example']
  .map(f => path.join(__dirname, '..', f))
  .find(f => fs.existsSync(f));

if (envFile) {
  require('dotenv').config({ path: envFile });
} else {
  console.error('❌  No .env file found in project folder.');
  process.exit(1);
}

const mysql = require('mysql2/promise');

// Helper: get env var, trimming whitespace (so "value   " = "value")
const env = k => (process.env[k] || '').trim();

// Validate required values
const missing = [];
if (!env('DB_NAME'))     missing.push('DB_NAME');
// DB_PASSWORD can legitimately be empty (MySQL with no root password)
// so we only check it's defined, not that it has a value

if (missing.length) {
  console.error('\n❌  Missing required database settings in .env:');
  missing.forEach(k => console.error(`     ${k} is not set`));
  console.error('\n    Open .env and add the missing values, then restart.\n');
  process.exit(1);
}

const pool = mysql.createPool({
  host:               env('DB_HOST') || 'localhost',
  port:               parseInt(env('DB_PORT'), 10) || 3306,
  user:               env('DB_USER') || 'root',
  password:           env('DB_PASSWORD'),   // blank = no password (valid for local MySQL)
  database:           env('DB_NAME'),
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+05:30',
});

pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL connected  →  ${env('DB_HOST') || 'localhost'}/${env('DB_NAME')}`);
    conn.release();
  })
  .catch(err => {
    console.error('\n❌  MySQL connection failed:', err.message);
    if (err.message.includes('Access denied'))
      console.error(`    → Wrong password. Check DB_PASSWORD in your .env file.`);
    else if (err.message.includes('ECONNREFUSED'))
      console.error('    → MySQL is not running. Please start it.');
    else if (err.message.includes('Unknown database'))
      console.error(`    → Database "${env('DB_NAME')}" does not exist.\n    → Run: mysql -u root -p < db/schema.sql`);
    console.error('');
    process.exit(1);
  });

module.exports = pool;
