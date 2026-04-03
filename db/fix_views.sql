-- ============================================================
-- PALM LEGACY — DB FIXES  (run this in MySQL)
-- Fixes "Unknown column 'user_id' in where clause" error
-- ============================================================
USE palm_legacy;

-- Fix v_order_summary — add user_id and customer_email columns
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
  COUNT(oi.id)  AS item_count,
  GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ', ') AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

SELECT 'v_order_summary view fixed ✅' AS status;
