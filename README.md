# 🌴 Palm Legacy — Pure Palm Jaggery  v3.0

Full B2C e-commerce + Admin + Finance platform built on Node.js + MySQL.

---

## 🚀 Setup (5 steps)

### 1. Import the database
```bash
mysql -u root -p < db/schema.sql
mysql -u root -p palm_legacy < db/fix_schema.sql
```

### 2. Set demo account passwords
```sql
UPDATE users
SET password_hash='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE email IN ('admin@palmlegacy.com','manager@palmlegacy.com','viewer@palmlegacy.com');
-- hash = bcrypt("password")
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure credentials
Edit `.env.example`, fill in your values, save as `.env`:
```
DB_PASSWORD=yourMysqlPassword
JWT_SECRET=anylongrandomstring
```
Everything else (SMTP, MSG91, WATI, Razorpay) is optional — app works without them.

### 5. Start
```bash
node server.js
```
Open → **http://localhost:4000/palm-legacy.html**

> Note: Server runs on **port 4000** (not 3000) so it doesn't conflict with Next.js or other dev servers.

---

## 🔑 Demo Accounts

| Email | Password | Role |
|---|---|---|
| admin@palmlegacy.com | password | 👑 Admin |
| manager@palmlegacy.com | password | 📊 Manager |
| viewer@palmlegacy.com | password | 👁️ Viewer |

---

## 📁 Files

```
palm-legacy/
├── palm-legacy.html      ← Full frontend app
├── server.js             ← Express API backend (port 4000)
├── package.json
├── .env.example          ← Copy to .env and fill in credentials
└── db/
    ├── schema.sql        ← Run first — creates all 18 tables
    ├── fix_schema.sql    ← Run second — fixes column names + adds missing columns
    ├── connection.js     ← MySQL pool
    ├── seed.json         ← Sample data reference
    └── palm-legacy-db-docs.docx
```

---

## 🛠️ If you hit errors

| Error | Fix |
|---|---|
| `Access denied` MySQL | Set `DB_PASSWORD` in `.env` |
| `JWT_SECRET is not set` | Add any random string as `JWT_SECRET` in `.env` |
| `Unknown column` | Run `fix_schema.sql` in MySQL |
| `Failed to fetch` / 404 from Next.js | Server is on port 4000 — open `http://localhost:4000/palm-legacy.html` |
| `Order failed` | Run `fix_schema.sql`, restart server |

