# Palm Legacy – User Roles & Permissions

## Roles

| Role | Who | Description |
|---|---|---|
| `admin` | Store owner / IT admin | Full access to everything |
| `manager` | Store manager / ops team | Orders, products, customers, analytics |
| `viewer` | Finance / read-only staff | View orders, customers, analytics |
| `customer` | End customers | Shop + own orders only |

## Permissions Matrix

| Screen / Feature | admin | manager | viewer | customer |
|---|:---:|:---:|:---:|:---:|
| **SHOP** | | | | |
| Browse & add to cart | ✅ | ✅ | ✅ | ✅ |
| Checkout & place order | ✅ | ✅ | ✅ | ✅ |
| **DASHBOARD** | | | | |
| My dashboard (personal stats) | ✅ | ✅ | ✅ | ✅ |
| My orders | ✅ | ✅ | ✅ | ✅ |
| Admin stats (revenue, totals) | ✅ | ✅ | ✅ | ❌ |
| **ORDERS** | | | | |
| View all orders | ✅ | ✅ | ✅ | ❌ |
| Edit order status | ✅ | ✅ | ❌ | ❌ |
| Send invoice / notify | ✅ | ✅ | ❌ | ❌ |
| Export CSV | ✅ | ✅ | ❌ | ❌ |
| **PRODUCTS** | | | | |
| View product master | ✅ | ✅ | ❌ | ❌ |
| Add / edit products | ✅ | ✅ | ❌ | ❌ |
| Upload product images | ✅ | ✅ | ❌ | ❌ |
| Enable / disable products | ✅ | ✅ | ❌ | ❌ |
| Delete products | ✅ | ✅ | ❌ | ❌ |
| **CATEGORY MASTER** | | | | |
| View categories | ✅ | ✅ | ❌ | ❌ |
| Add / edit categories | ✅ | ✅ | ❌ | ❌ |
| Delete categories | ✅ | ✅ | ❌ | ❌ |
| **UOM MASTER** | | | | |
| View UOMs | ✅ | ✅ | ❌ | ❌ |
| Add / edit UOMs | ✅ | ✅ | ❌ | ❌ |
| Delete UOMs | ✅ | ✅ | ❌ | ❌ |
| **CUSTOMERS** | | | | |
| View customer list | ✅ | ✅ | ✅ | ❌ |
| **ANALYTICS** | | | | |
| View analytics | ✅ | ✅ | ✅ | ❌ |
| **REPORTS** | | | | |
| Download reports | ✅ | ✅ | ❌ | ❌ |
| **USER ACCESS** | | | | |
| View users | ✅ | ❌ | ❌ | ❌ |
| Add admin users | ✅ | ❌ | ❌ | ❌ |
| Change user roles | ✅ | ❌ | ❌ | ❌ |
| Remove users | ✅ | ❌ | ❌ | ❌ |
| **SETTINGS** | | | | |
| Store settings | ✅ | ❌ | ❌ | ❌ |

## How Role is Assigned

1. **Customer** — automatically assigned when a user registers via the shop
2. **Admin assigns role** — in Admin → User Access page, admin can change any user's role
3. The change takes effect **immediately** on next login

## Navigation Visibility

- Admin nav shows: Dashboard → My Orders → All Orders → Products → Customers → Analytics → Reports → **User Access** → **Settings**
- Manager nav shows: Dashboard → My Orders → All Orders → Products → Customers → Analytics → Reports
- Viewer nav shows: Dashboard → My Orders → All Orders → Customers → Analytics
- Customer nav shows: Dashboard → My Orders only
