// db/connection.js
"use strict";
const path = require("path");
const fs   = require("fs");

// Load .env if present (local dev). On Render/Railway env vars are injected directly.
const envFile = [".env", ".env.example"]
  .map(f => path.join(__dirname, "..", f))
  .find(f => fs.existsSync(f));
if (envFile) require("dotenv").config({ path: envFile });

const env = k => (process.env[k] || "").trim();
const mysql = require("mysql2/promise");

// Create pool — don't exit on missing vars; let the app start and show a proper error
const pool = mysql.createPool({
  host:               env("DB_HOST")     || "localhost",
  port:               parseInt(env("DB_PORT"), 10) || 3306,
  user:               env("DB_USER")     || "root",
  password:           env("DB_PASSWORD") || "",
  database:           env("DB_NAME")     || "palm_legacy",
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           "+05:30",
});

// Test the connection — log result but NEVER exit the process
// The server must keep running so it can serve the frontend and show a helpful error
pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL connected  →  ${env("DB_HOST") || "localhost"}/${env("DB_NAME") || "palm_legacy"}`);
    conn.release();
  })
  .catch(err => {
    console.error("\n⚠️  MySQL connection warning:", err.message);
    console.error("   The server will still start, but API calls will fail until DB is reachable.");
    console.error("   Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in your environment.\n");
    // DO NOT process.exit(1) — let the server serve the frontend page
  });

module.exports = pool;
