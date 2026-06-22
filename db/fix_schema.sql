-- ============================================================
--  PALM LEGACY — Schema Fix  v3.2
--  Run once after importing schema.sql:
--    mysql -u root -p palm_legacy < db/fix_schema.sql
--
--  Safe to re-run — all ALTER TABLE use IF NOT EXISTS / IF EXISTS,
--  and CREATE TABLE uses IF NOT EXISTS.
-- ============================================================
USE palm_legacy;

-- ── FIX 1: products table ─────────────────────────────────────────────────
-- Original schema used: selling_price, stock_units, quantity
-- Server expects:       price, stock, weight_grams
ALTER TABLE products
  CHANGE COLUMN selling_price price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN stock_units   stock        INT           NOT NULL DEFAULT 0,
  CHANGE COLUMN quantity      weight_grams DECIMAL(10,3) NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags VARCHAR(200) DEFAULT '';

SELECT 'FIX 1 — products columns ✅' AS status;

-- ── FIX 2: orders — add created_at ───────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE orders SET created_at = ordered_at WHERE created_at IS NULL;

SELECT 'FIX 2 — orders.created_at ✅' AS status;

-- ── FIX 3: orders — Razorpay columns ─────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_order_id   VARCHAR(100) DEFAULT NULL;

SELECT 'FIX 3 — orders razorpay columns ✅' AS status;

-- ── FIX 4: hero_banners table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hero_banners (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  image_url   MEDIUMTEXT   NOT NULL,
  tag         VARCHAR(100) DEFAULT '',
  title       VARCHAR(200) DEFAULT '',
  description TEXT         DEFAULT NULL,
  btn_text    VARCHAR(100) DEFAULT '',
  btn_url     VARCHAR(300) DEFAULT NULL,
  sort_order  INT          DEFAULT 0,
  is_active   TINYINT(1)   DEFAULT 1,
  created_by  INT          DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

SELECT 'FIX 4 — hero_banners table ✅' AS status;

-- ── FIX 5: v_order_summary view — include created_at & user_id ───────────
DROP VIEW IF EXISTS v_order_summary;
CREATE VIEW v_order_summary AS
SELECT
  o.id, o.user_id, o.order_number, o.customer_name,
  o.customer_mobile, o.customer_email, o.grand_total,
  o.payment_method, o.payment_status, o.order_status,
  o.ordered_at, o.created_at, o.city, o.state, o.pincode,
  COUNT(oi.id) AS item_count,
  GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ', ') AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

SELECT 'FIX 5 — v_order_summary view ✅' AS status;

-- ── FIX 6: orders — expand payment_method to VARCHAR ─────────────────────
-- Original ENUM('upi','card','cod') was too restrictive for dynamic values
ALTER TABLE orders
  MODIFY COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'cod';

SELECT 'FIX 6 — orders.payment_method expanded ✅' AS status;

-- ── FIX 7: picklist tables ────────────────────────────────────────────────
-- picklists holds the auto-increment sequence (PALM_000000001, etc.)
CREATE TABLE IF NOT EXISTS picklists (
  id          INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  picklist_no VARCHAR(20) NOT NULL UNIQUE,
  created_by  INT,
  created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS picklist_no VARCHAR(20) DEFAULT NULL;

-- Add index only if it doesn't already exist
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name   = 'orders'
    AND index_name   = 'idx_picklist_no'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE orders ADD INDEX idx_picklist_no (picklist_no)',
  'SELECT ''idx_picklist_no already exists'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'FIX 7 — picklists table + orders.picklist_no ✅' AS status;

-- ── FIX 8: auth_otps — expand otp_code for bcrypt hashes ─────────────────
-- Step 1 upgrade stores bcrypt hashes (60 chars) instead of raw 6-digit OTPs.
-- Original VARCHAR(10) is too small — expand to VARCHAR(60).
ALTER TABLE auth_otps
  MODIFY COLUMN otp_code VARCHAR(60) NOT NULL;

SELECT 'FIX 8 — auth_otps.otp_code expanded to VARCHAR(60) ✅' AS status;

-- ── DONE ──────────────────────────────────────────────────────────────────
SELECT '✅  All fixes applied — Palm Legacy v3.2 ready!' AS result;

-- ── FIX 9: Invoice support ────────────────────────────────────────────────
-- invoice_no format: INV-<order_number>  e.g. INV-F262803000001
CREATE TABLE IF NOT EXISTS invoices (
  id           INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_no   VARCHAR(30) NOT NULL UNIQUE,
  order_id     INT         NOT NULL,
  picklist_no  VARCHAR(20) DEFAULT NULL,
  generated_by INT,
  generated_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by) REFERENCES users(id)  ON DELETE SET NULL
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(30) DEFAULT NULL;

SELECT 'FIX 9 — invoices table + orders.invoice_no ✅' AS status;

-- ── FIX 10: Shiprocket integration columns ────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shiprocket_order_id   VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shiprocket_shipment_id VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS awb_code               VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS courier_name           VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tracking_url           VARCHAR(500) DEFAULT NULL;

SELECT 'FIX 10 — Shiprocket columns added to orders ✅' AS status;

--------------------------------------------------------


ALTER TABLE product_images
  MODIFY COLUMN image_url LONGTEXT NOT NULL;
 
ALTER TABLE hero_banners
  MODIFY COLUMN image_url LONGTEXT NOT NULL;

-----------------For sliding product------------------------------------

ALTER TABLE products
  ADD COLUMN slide_interval_sec DECIMAL(4,1) NULL DEFAULT NULL
  COMMENT 'Seconds between auto-slide image transitions on shop page. NULL = disabled.';

-----------------For website visiter--------------------------------------


CREATE TABLE IF NOT EXISTS visitor_sessions (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_uid         VARCHAR(64)  NOT NULL,        -- random ID from browser localStorage
  user_id             INT          NULL,            -- linked once visitor logs in
  ip_address          VARCHAR(64)  NULL,             -- nullable — respects TRACK_IP flag
  country             VARCHAR(100) NULL,
  region              VARCHAR(100) NULL,
  city                VARCHAR(100) NULL,
  device_type         ENUM('mobile','tablet','desktop','other') NOT NULL DEFAULT 'other',
  browser             VARCHAR(60)  NULL,
  browser_version     VARCHAR(20)  NULL,
  os                  VARCHAR(60)  NULL,
  referrer            VARCHAR(500) NULL,             -- where the visitor came from
  referrer_domain     VARCHAR(200) NULL,              -- parsed domain, e.g. "google.com"
  landing_page        VARCHAR(300) NULL,              -- first page seen
  entry_at            DATETIME     NOT NULL,
  last_seen_at        DATETIME     NOT NULL,          -- updated by heartbeat pings
  session_duration_sec INT         NOT NULL DEFAULT 0, -- updated by heartbeat pings
  page_view_count     INT          NOT NULL DEFAULT 1,
  is_bounce           TINYINT(1)   NOT NULL DEFAULT 1, -- 1 = left after 1 page view, 0 = browsed more
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_visitor_uid   (visitor_uid),
  INDEX idx_entry_at      (entry_at),
  INDEX idx_user_id       (user_id),
  INDEX idx_device_type   (device_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-------
CREATE TABLE IF NOT EXISTS page_views (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id    BIGINT       NOT NULL,
  page_path     VARCHAR(300) NOT NULL,    -- e.g. "/", "#products", "/admin"
  page_title    VARCHAR(200) NULL,
  viewed_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  time_on_page_sec INT       NOT NULL DEFAULT 0,  -- updated when visitor navigates away

  INDEX idx_session_id  (session_id),
  INDEX idx_page_path   (page_path),
  INDEX idx_viewed_at   (viewed_at),
  FOREIGN KEY (session_id) REFERENCES visitor_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════
-- Useful pre-built views for fast dashboard queries
-- ════════════════════════════════════════════════════════════════

-- Daily traffic summary — powers the trend charts
CREATE OR REPLACE VIEW v_daily_traffic AS
SELECT
  DATE(entry_at)                              AS visit_date,
  COUNT(*)                                    AS total_sessions,
  COUNT(DISTINCT visitor_uid)                 AS unique_visitors,
  SUM(page_view_count)                        AS total_page_views,
  ROUND(AVG(session_duration_sec),0)          AS avg_duration_sec,
  ROUND(100 * SUM(is_bounce) / COUNT(*), 1)   AS bounce_rate_pct
FROM visitor_sessions
GROUP BY DATE(entry_at)
ORDER BY visit_date DESC;

-- Most visited pages — powers "Top Pages" widget
CREATE OR REPLACE VIEW v_top_pages AS
SELECT
  page_path,
  COUNT(*)                  AS view_count,
  COUNT(DISTINCT session_id) AS unique_sessions,
  ROUND(AVG(time_on_page_sec),0) AS avg_time_on_page_sec
FROM page_views
GROUP BY page_path
ORDER BY view_count DESC;

-- Device breakdown — powers the pie chart
CREATE OR REPLACE VIEW v_device_breakdown AS
SELECT device_type, COUNT(*) AS sessions
FROM visitor_sessions
GROUP BY device_type;

-- Top referrer / traffic sources
CREATE OR REPLACE VIEW v_top_referrers AS
SELECT
  COALESCE(NULLIF(referrer_domain,''), 'Direct') AS source,
  COUNT(*) AS sessions
FROM visitor_sessions
GROUP BY source
ORDER BY sessions DESC;