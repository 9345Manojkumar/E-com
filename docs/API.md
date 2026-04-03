# Palm Legacy – REST API Reference

Replace the in-memory data in `src/js/data.js` with these endpoints.

## Base URL
```
https://api.palmlegacy.com/v1
```

---

## 🔐 AUTH

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login with email/mobile + password |
| POST | `/auth/send-otp` | Send OTP to mobile/email |
| POST | `/auth/verify-otp` | Verify OTP → returns JWT token |
| POST | `/auth/signup` | Register new customer |
| POST | `/auth/logout` | Invalidate token |

**Login Request:**
```json
{ "identifier": "admin@palmlegacy.com", "password": "admin123" }
```
**Login Response:**
```json
{
  "token": "eyJhbGci...",
  "user": { "id": 1, "name": "Arjun Kumar", "role": "admin", "email": "..." }
}
```

---

## 📦 PRODUCTS (Public)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/products` | List all active products |
| GET | `/products/:id` | Get single product |
| GET | `/products?category_id=1` | Filter by category |
| GET | `/products/:id/images` | Get product images |

**Product Response:**
```json
{
  "id": 1,
  "name": "Palm Jaggery Block",
  "description": "...",
  "selling_price": 180,
  "mrp": 220,
  "quantity": 500,
  "uom": { "id": 1, "name": "Gram", "short_code": "g" },
  "category": { "id": 1, "name": "Jaggery Blocks", "icon": "🟤", "bg_color": "#FFF8E8" },
  "display_weight": "500g",
  "badge_label": "Bestseller",
  "rating": 4.9,
  "review_count": 384,
  "stock_units": 142,
  "is_active": true,
  "images": [
    { "url": "https://cdn.../img1.jpg", "is_primary": true },
    { "url": "https://cdn.../img2.jpg", "is_primary": false }
  ]
}
```

---

## 📦 PRODUCTS (Admin — requires token + role: admin/manager)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/products` | Create product |
| PUT | `/admin/products/:id` | Update product |
| DELETE | `/admin/products/:id` | Delete product |
| PATCH | `/admin/products/:id/toggle` | Enable/disable |
| POST | `/admin/products/:id/images` | Upload images (multipart) |
| DELETE | `/admin/products/:id/images/:imgId` | Delete image |
| PATCH | `/admin/products/:id/images/:imgId/primary` | Set primary image |

---

## 📁 CATEGORIES

| Method | Endpoint | Description |
|---|---|---|
| GET | `/categories` | List all categories |
| POST | `/admin/categories` | Create category |
| PUT | `/admin/categories/:id` | Update category |
| DELETE | `/admin/categories/:id` | Delete (if no products) |

---

## ⚖️ UOM

| Method | Endpoint | Description |
|---|---|---|
| GET | `/uom` | List all UOMs |
| POST | `/admin/uom` | Create UOM |
| PUT | `/admin/uom/:id` | Update UOM |
| DELETE | `/admin/uom/:id` | Delete (if not in use) |

---

## 🛒 ORDERS

| Method | Endpoint | Description |
|---|---|---|
| POST | `/orders` | Place order (requires auth) |
| GET | `/orders/my` | My orders (customer) |
| GET | `/admin/orders` | All orders (admin/manager/viewer) |
| GET | `/admin/orders/:id` | Order detail |
| PATCH | `/admin/orders/:id/status` | Update order status |
| GET | `/admin/orders?status=pending` | Filter by status |
| GET | `/admin/orders?export=csv` | Export orders CSV |

**Place Order Request:**
```json
{
  "customer_name": "Radha Krishnan",
  "customer_mobile": "9876543210",
  "customer_email": "radha@gmail.com",
  "delivery_address": "12 MG Road",
  "city": "Chennai",
  "state": "Tamil Nadu",
  "pincode": "600001",
  "payment_method": "upi",
  "upi_id": "radha@okicici",
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 3, "quantity": 1 }
  ]
}
```

---

## 👥 USERS (Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | All users |
| POST | `/admin/users` | Create admin user |
| PATCH | `/admin/users/:id/role` | Change user role |
| DELETE | `/admin/users/:id` | Remove user |

---

## 📊 ANALYTICS (Admin/Manager)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/analytics/revenue` | Revenue by month |
| GET | `/admin/analytics/top-products` | Top selling products |
| GET | `/admin/analytics/summary` | Dashboard stats |

---

## 🔑 Authentication Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```
