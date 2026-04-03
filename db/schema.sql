-- ============================================================
--  PALM LEGACY – COMPLETE DATABASE SCHEMA  v2.0
--  Engine : MySQL 8.0+
--  Run    : mysql -u root -p < db/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS palm_legacy
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE palm_legacy;

-- ─────────────────────────────────────────────────────────────
-- 1. UOM MASTER
-- ─────────────────────────────────────────────────────────────
CREATE TABLE uom_master (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  short_code  VARCHAR(10)  NOT NULL UNIQUE,
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO uom_master (name, short_code) VALUES
  ('Gram',       'g'),
  ('Kilogram',   'kg'),
  ('Milliliter', 'ml'),
  ('Liter',      'L'),
  ('Piece',      'pcs'),
  ('Packet',     'pkt'),
  ('Box',        'box');

-- ─────────────────────────────────────────────────────────────
-- 2. CATEGORY MASTER
-- ─────────────────────────────────────────────────────────────
CREATE TABLE category_master (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(10)  DEFAULT '📦',
  bg_color    VARCHAR(10)  DEFAULT '#FFF8E8',
  is_active   BOOLEAN      DEFAULT TRUE,
  sort_order  INT          DEFAULT 0,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO category_master (name, icon, bg_color, sort_order) VALUES
  ('Jaggery Blocks', '🟤', '#FFF8E8', 1),
  ('Jaggery Powder', '🫙', '#FFF3D0', 2),
  ('Palm Candy',     '💎', '#F0FFF0', 3),
  ('Palm Sugar',     '🌟', '#FFF8E8', 4),
  ('Combo Packs',    '🎁', '#FFF0F5', 5),
  ('Bulk Packs',     '📦', '#F5F0FF', 6);

-- ─────────────────────────────────────────────────────────────
-- 3. PRODUCT MASTER
-- ─────────────────────────────────────────────────────────────
CREATE TABLE products (
  id            INT             NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200)    NOT NULL,
  description   TEXT,
  selling_price DECIMAL(10,2)   NOT NULL,
  mrp           DECIMAL(10,2)   NOT NULL,
  quantity      DECIMAL(10,3)   NOT NULL,
  uom_id        INT             NOT NULL,
  category_id   INT             NOT NULL,
  stock_units   INT             DEFAULT 0,
  badge_label   VARCHAR(50),
  is_bestseller BOOLEAN         DEFAULT FALSE,
  rating        DECIMAL(3,2)    DEFAULT 5.00,
  review_count  INT             DEFAULT 0,
  total_sold    INT             DEFAULT 0,
  is_active     BOOLEAN         DEFAULT TRUE,
  sort_order    INT             DEFAULT 0,
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (uom_id)      REFERENCES uom_master(id),
  FOREIGN KEY (category_id) REFERENCES category_master(id)
);

INSERT INTO products
  (name, description, selling_price, mrp, quantity, uom_id, category_id,
   stock_units, badge_label, is_bestseller, rating, review_count, total_sold) VALUES
  ('Palm Jaggery Block',
   'Traditional Palmyra blocks rich in iron and minerals. Perfect for sweets, cooking & daily use.',
   180, 220,  500, 1, 1, 142, 'Bestseller', TRUE,  4.9, 384, 384),
  ('Palm Jaggery Powder',
   'Finely ground powder. Blends instantly into tea, coffee, payasam and baked goods.',
   220, 260,  500, 1, 2,  88, 'Popular',    FALSE, 4.8, 219, 219),
  ('Palm Candy (Kalkandu)',
   'Crystal-clear candy with a distinct caramel sweetness. A traditional treat for all ages.',
   240, 280,  250, 1, 3,  12, 'Traditional',FALSE, 4.9, 156, 156),
  ('Palm Sugar Granules',
   '100% natural low-GI alternative to cane sugar. Ideal for health-conscious lifestyles.',
   320, 380,  400, 1, 4,   6, 'Healthy',    FALSE, 4.7,  98,  98),
  ('Family Combo Pack',
   'Jaggery Block 1kg + Powder 500g + Palm Candy 250g. Best value for the whole family!',
   580, 760, 1750, 1, 5,  34, 'Best Value', TRUE,  5.0,  67,  67),
  ('Bulk Jaggery Block 2kg',
   'Bulk pack for families and restaurants. Same purity, more savings. Stays fresh 6 months.',
   320, 400, 2000, 1, 6,  67, 'Bulk Pack',  FALSE, 4.8, 143, 143);

-- ─────────────────────────────────────────────────────────────
-- 4. PRODUCT IMAGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE product_images (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  INT          NOT NULL,
  image_url   VARCHAR(500) NOT NULL,
  is_primary  BOOLEAN      DEFAULT FALSE,
  sort_order  INT          DEFAULT 0,
  alt_text    VARCHAR(200),
  file_size   INT,
  mime_type   VARCHAR(50)  DEFAULT 'image/jpeg',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_images (product_id, is_primary)
);

-- ─────────────────────────────────────────────────────────────
-- 5. USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100),
  email            VARCHAR(200) UNIQUE,
  mobile           VARCHAR(15)  UNIQUE,
  password_hash    VARCHAR(255),
  role             ENUM('admin','manager','viewer','customer') DEFAULT 'customer',
  is_active        BOOLEAN      DEFAULT TRUE,
  email_verified   BOOLEAN      DEFAULT FALSE,
  mobile_verified  BOOLEAN      DEFAULT FALSE,
  last_login       TIMESTAMP    NULL,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO users (first_name, last_name, email, mobile, password_hash, role) VALUES
  ('Arjun',  'Kumar',    'admin@palmlegacy.com',   '9000000001', '$2b$10$placeholder_admin',   'admin'),
  ('Priya',  'Sharma',   'manager@palmlegacy.com', '9000000002', '$2b$10$placeholder_manager', 'manager'),
  ('Ravi',   'Natarajan','viewer@palmlegacy.com',  '9000000003', '$2b$10$placeholder_viewer',  'viewer');

-- ─────────────────────────────────────────────────────────────
-- 6. USER ADDRESSES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_addresses (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NOT NULL,
  label        VARCHAR(50)  DEFAULT 'Home',
  address_line VARCHAR(300) NOT NULL,
  city         VARCHAR(100) NOT NULL,
  state        VARCHAR(100) NOT NULL,
  pincode      VARCHAR(10)  NOT NULL,
  is_default   BOOLEAN      DEFAULT FALSE,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 7. ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_number     VARCHAR(20)   NOT NULL UNIQUE,
  user_id          INT,
  customer_name    VARCHAR(200)  NOT NULL,
  customer_email   VARCHAR(200),
  customer_mobile  VARCHAR(15)   NOT NULL,
  delivery_address VARCHAR(300)  NOT NULL,
  city             VARCHAR(100)  NOT NULL,
  state            VARCHAR(100)  NOT NULL,
  pincode          VARCHAR(10)   NOT NULL,
  subtotal         DECIMAL(10,2) NOT NULL,
  offer_discount   DECIMAL(10,2) DEFAULT 0.00,
  promo_discount   DECIMAL(10,2) DEFAULT 0.00,
  promo_code       VARCHAR(50),
  delivery_charge  DECIMAL(10,2) DEFAULT 0.00,
  cod_charge       DECIMAL(10,2) DEFAULT 0.00,
  grand_total      DECIMAL(10,2) NOT NULL,
  payment_method   ENUM('upi','card','cod') NOT NULL,
  payment_status   ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  order_status     ENUM('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
  payment_ref      VARCHAR(100),
  notes            TEXT,
  ordered_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_status (order_status),
  INDEX idx_user_orders  (user_id),
  INDEX idx_ordered_at   (ordered_at)
);

-- ─────────────────────────────────────────────────────────────
-- 8. ORDER ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_items (
  id            INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id      INT           NOT NULL,
  product_id    INT,
  product_name  VARCHAR(200)  NOT NULL,
  product_qty   DECIMAL(10,3) NOT NULL,
  product_uom   VARCHAR(10)   NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  mrp           DECIMAL(10,2) NOT NULL,
  quantity      INT           NOT NULL DEFAULT 1,
  line_total    DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- 9. OTP / AUTH TOKENS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE auth_otps (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  identifier  VARCHAR(200) NOT NULL,
  otp_code    VARCHAR(10)  NOT NULL,
  purpose     ENUM('login','signup','reset') DEFAULT 'login',
  expires_at  TIMESTAMP    NOT NULL,
  is_used     BOOLEAN      DEFAULT FALSE,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier (identifier),
  INDEX idx_expires    (expires_at)
);

-- ─────────────────────────────────────────────────────────────
-- 10. NEWSLETTER SUBSCRIBERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE newsletter_subscribers (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(200) NOT NULL UNIQUE,
  is_active     BOOLEAN      DEFAULT TRUE,
  subscribed_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 11. PRODUCT REVIEWS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE product_reviews (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  INT          NOT NULL,
  user_id     INT,
  reviewer_name VARCHAR(100),
  city        VARCHAR(100),
  rating      TINYINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  is_approved BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- 12. PRICING POLICIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pricing_policies (
  id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type           ENUM('offer','promo') NOT NULL,
  name           VARCHAR(200) NOT NULL,
  code           VARCHAR(50)  UNIQUE,
  discount_type  ENUM('percent','override') NOT NULL,
  percent        DECIMAL(5,2),
  override_price DECIMAL(10,2),
  cap_amount     DECIMAL(10,2),
  scope          ENUM('all','category','product','min_order') DEFAULT 'all',
  scope_id       INT,
  min_order_amt  DECIMAL(10,2),
  valid_from     DATE         NOT NULL,
  valid_to       DATE         NOT NULL,
  total_uses     INT,
  per_user_limit INT,
  used_count     INT          DEFAULT 0,
  is_active      BOOLEAN      DEFAULT TRUE,
  created_by     INT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_code        (code),
  INDEX idx_type_active (type, is_active)
);

CREATE TABLE promo_usage (
  id          INT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  policy_id   INT       NOT NULL,
  user_id     INT,
  order_id    INT,
  used_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (policy_id) REFERENCES pricing_policies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id)  REFERENCES orders(id) ON DELETE SET NULL
);

INSERT INTO pricing_policies
  (type, name, discount_type, percent, cap_amount, scope, valid_from, valid_to, is_active) VALUES
  ('offer','Weekend Special','percent',15.00,100.00,'all','2026-03-01','2026-03-31',TRUE);

INSERT INTO pricing_policies
  (type, name, code, discount_type, percent, cap_amount, scope, valid_from, valid_to, total_uses, per_user_limit, is_active) VALUES
  ('promo','Welcome Offer',   'WELCOME10','percent',10.00, 50.00,'all',      '2026-01-01','2026-12-31',500,1,TRUE),
  ('promo','Min ₹500 Discount','SAVE12',  'percent',12.00, 80.00,'min_order','2026-03-01','2026-06-30',NULL,NULL,TRUE);

-- ─────────────────────────────────────────────────────────────
-- 13. SUPPLIERS MASTER
-- ─────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  contact     VARCHAR(100),
  mobile      VARCHAR(15),
  email       VARCHAR(200),
  gstin       VARCHAR(20),
  address     VARCHAR(300),
  city        VARCHAR(100),
  state       VARCHAR(100),
  pincode     VARCHAR(10),
  credit_days INT          DEFAULT 30,
  opening_balance DECIMAL(12,2) DEFAULT 0.00,
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO suppliers (name, mobile, email, gstin, city, state, credit_days) VALUES
  ('Palmyra Farms Co.',   '9800001111', 'palmyra@farms.com',   '33AAAAA0000A1Z5', 'Madurai',     'Tamil Nadu', 30),
  ('Natural Jaggery Ltd', '9800002222', 'natural@jaggery.com', '33BBBBB0000B1Z5', 'Tirunelveli', 'Tamil Nadu', 30),
  ('Tamil Palm Corp',     '9800003333', 'info@tamilpalm.com',  '33CCCCC0000C1Z5', 'Salem',       'Tamil Nadu', 45);

-- ─────────────────────────────────────────────────────────────
-- 14. ITEM TRANSACTIONS  (Inventory Ledger)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE item_transactions (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  txn_ref     VARCHAR(50)   NOT NULL,
  txn_type    ENUM('purchase','sale','purchase_return','sale_return',
                   'stock_in','stock_out','adjust') NOT NULL,
  direction   ENUM('in','out') NOT NULL,
  txn_date    DATE          NOT NULL,
  product_id  INT           NOT NULL,
  qty         DECIMAL(10,3) NOT NULL,
  uom_id      INT           NOT NULL,
  rate        DECIMAL(10,2) DEFAULT 0.00,
  amount      DECIMAL(12,2) DEFAULT 0.00,
  party_name  VARCHAR(200),
  party_type  ENUM('customer','supplier','internal') DEFAULT 'internal',
  ref_doc     VARCHAR(100),
  notes       TEXT,
  created_by  INT,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (uom_id)     REFERENCES uom_master(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_date (product_id, txn_date),
  INDEX idx_direction    (direction, txn_date)
);

-- ─────────────────────────────────────────────────────────────
-- 15. AR TRANSACTIONS  (Accounts Receivable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ar_transactions (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  txn_date     DATE          NOT NULL,
  txn_type     ENUM('sale','sale_return','receipt') NOT NULL,
  customer_id  INT,
  party_name   VARCHAR(200)  NOT NULL,
  ref_doc      VARCHAR(100),
  debit_amt    DECIMAL(12,2) DEFAULT 0.00,
  credit_amt   DECIMAL(12,2) DEFAULT 0.00,
  payment_mode ENUM('credit','upi','cash','bank','cheque','card') DEFAULT 'credit',
  due_date     DATE,
  status       ENUM('draft','posted','partial','paid','cancelled') DEFAULT 'posted',
  notes        TEXT,
  created_by   INT,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ar_party  (party_name, txn_date),
  INDEX idx_ar_status (status, due_date)
);

-- ─────────────────────────────────────────────────────────────
-- 16. AP TRANSACTIONS  (Accounts Payable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ap_transactions (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  txn_date     DATE          NOT NULL,
  txn_type     ENUM('purchase','purchase_return','payment') NOT NULL,
  supplier_id  INT,
  party_name   VARCHAR(200)  NOT NULL,
  ref_doc      VARCHAR(100),
  debit_amt    DECIMAL(12,2) DEFAULT 0.00,
  credit_amt   DECIMAL(12,2) DEFAULT 0.00,
  payment_mode ENUM('credit','upi','cash','bank','cheque','card') DEFAULT 'credit',
  due_date     DATE,
  status       ENUM('draft','posted','partial','paid','cancelled') DEFAULT 'posted',
  notes        TEXT,
  created_by   INT,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ap_party  (party_name, txn_date),
  INDEX idx_ap_status (status, due_date)
);

-- ═══════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════

CREATE VIEW v_products_full AS
SELECT
  p.*,
  c.name       AS category_name,
  c.icon       AS category_icon,
  c.bg_color   AS category_bg,
  u.name       AS uom_name,
  u.short_code AS uom_short,
  CONCAT(p.quantity, u.short_code) AS display_weight,
  (SELECT image_url FROM product_images pi
   WHERE pi.product_id = p.id AND pi.is_primary = TRUE
   ORDER BY pi.sort_order LIMIT 1)   AS primary_image,
  (SELECT COUNT(*) FROM product_images pi2
   WHERE pi2.product_id = p.id)      AS image_count
FROM products p
JOIN category_master c ON c.id = p.category_id
JOIN uom_master u      ON u.id = p.uom_id;

CREATE VIEW v_stock_position AS
SELECT
  p.id                                                              AS product_id,
  p.name                                                            AS product_name,
  c.name                                                            AS category,
  u.short_code                                                      AS uom,
  COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.qty ELSE 0 END),0) AS total_in,
  COALESCE(SUM(CASE WHEN t.direction='out' THEN t.qty ELSE 0 END),0) AS total_out,
  COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.qty ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN t.direction='out' THEN t.qty ELSE 0 END),0) AS balance_qty,
  COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.amount ELSE 0 END),0) AS inbound_value,
  COALESCE(SUM(CASE WHEN t.direction='out' THEN t.amount ELSE 0 END),0) AS outbound_value
FROM products p
JOIN category_master c  ON c.id = p.category_id
JOIN uom_master u       ON u.id = p.uom_id
LEFT JOIN item_transactions t ON t.product_id = p.id
GROUP BY p.id;

CREATE VIEW v_order_summary AS
SELECT
  o.id, o.order_number, o.customer_name, o.customer_mobile,
  o.grand_total, o.payment_method, o.payment_status,
  o.order_status, o.ordered_at, o.city, o.state,
  COUNT(oi.id)                                                          AS item_count,
  GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ', ')          AS items
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

CREATE VIEW v_ar_party_balance AS
SELECT
  party_name,
  SUM(debit_amt)                   AS total_invoiced,
  SUM(credit_amt)                  AS total_received,
  SUM(debit_amt) - SUM(credit_amt) AS outstanding
FROM ar_transactions
WHERE status != 'cancelled'
GROUP BY party_name;

CREATE VIEW v_ap_party_balance AS
SELECT
  party_name,
  SUM(credit_amt)                  AS total_purchased,
  SUM(debit_amt)                   AS total_paid,
  SUM(credit_amt) - SUM(debit_amt) AS outstanding_payable
FROM ap_transactions
WHERE status != 'cancelled'
GROUP BY party_name;

CREATE VIEW v_revenue_by_month AS
SELECT
  DATE_FORMAT(ordered_at,'%Y-%m') AS month,
  COUNT(*)                         AS order_count,
  SUM(grand_total)                 AS revenue,
  AVG(grand_total)                 AS avg_order_value
FROM orders
WHERE order_status != 'cancelled'
GROUP BY DATE_FORMAT(ordered_at,'%Y-%m')
ORDER BY month;

-- ─────────────────────────────────────────────────────────────
-- FIX: Drop and recreate v_order_summary with user_id
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_order_summary;
CREATE VIEW v_order_summary AS
SELECT
  o.id,
  o.user_id,
  o.order_number,
  o.customer_name,
  o.customer_mobile,
  o.customer_email,
  o.grand_total,
  o.payment_method,
  o.payment_status,
  o.order_status,
  o.ordered_at,
  o.city,
  o.state,
  o.pincode,
  COUNT(oi.id)                                                          AS item_count,
  GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ', ')          AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

-- ─────────────────────────────────────────────────────────────
-- 18. HERO BANNERS  (added v3.0)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hero_banners (
  id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  image_url   MEDIUMTEXT NOT NULL,
  tag         VARCHAR(100)  DEFAULT '',
  title       VARCHAR(200)  DEFAULT '',
  description TEXT          DEFAULT NULL,
  btn_text    VARCHAR(100)  DEFAULT '',
  btn_url     VARCHAR(300)  DEFAULT NULL,
  sort_order  INT           DEFAULT 0,
  is_active   TINYINT(1)    DEFAULT 1,
  created_by  INT           DEFAULT NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- ALTER orders table to store Razorpay IDs  (added v3.0)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_order_id   VARCHAR(100) DEFAULT NULL;
