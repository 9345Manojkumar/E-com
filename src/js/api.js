/* Palm Legacy – API Layer (connects to MySQL via server.js) */

const API_BASE = 'http://localhost:3000/api';
const USE_API = true; // always use MySQL DB

// Connect to MySQL backend — required, no demo fallback
async function detectBackend(){
  try {
    await loadFromAPI();
    console.log('✅ MySQL DB connected');
  } catch(e) {
    showToast('⚠️ Cannot connect to server. Make sure node server.js is running.');
    console.error('Backend error:', e.message);
  }
}

// JWT token storage
function getToken(){ return localStorage.getItem('pl_token'); }
function setToken(t){ if(t) localStorage.setItem('pl_token',t); else localStorage.removeItem('pl_token'); }

// Generic API fetch helper
async function apiFetch(path, options={}){
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    ...options
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// Load all data from MySQL API into memory
async function loadFromAPI(){
  try {
    const [products, categories, uoms] = await Promise.all([
      apiFetch('/products'),
      apiFetch('/categories'),
      apiFetch('/uom'),
    ]);
    // Replace in-memory arrays
    PRODUCTS  = products.map(p=>({
      id: p.id, name: p.name, desc: p.description||'',
      price: parseFloat(p.selling_price), mrp: parseFloat(p.mrp),
      qty: parseFloat(p.quantity), uomId: p.uom_id, catId: p.category_id,
      badge: p.badge_label||'', bc: p.is_bestseller?'bestseller':'',
      rating: parseFloat(p.rating)||5, reviews: p.review_count||0,
      stock: p.stock_units||0, sold: p.total_sold||0,
      images: (p.images||[]).map(i=>({src:i.src||i.image_url, primary:i.primary||i.is_primary})),
      active: p.is_active!==false && p.is_active!==0
    }));
async function apiLogin(identifier, password){
  const data = await apiFetch('/auth/login', {
    method:'POST', body: JSON.stringify({identifier, password})
  });
  setToken(data.token);
  return { name: data.user.name, email: data.user.email, mobile: data.user.mobile,
           role: data.user.role, id: data.user.id };
}

async function apiSignup(first_name, last_name, email, mobile, password){
  const data = await apiFetch('/auth/signup', {
    method:'POST', body: JSON.stringify({first_name, last_name, email, mobile, password})
  });
  setToken(data.token);
  return { name: data.user.name, email: data.user.email, mobile: data.user.mobile,
           role: data.user.role, id: data.user.id };
}

async function apiSendOTP(identifier){
  return apiFetch('/auth/send-otp', {method:'POST', body: JSON.stringify({identifier})});
}

async function apiVerifyOTP(identifier, otp){
  const data = await apiFetch('/auth/verify-otp', {
    method:'POST', body: JSON.stringify({identifier, otp})
  });
  setToken(data.token);
  return { name: data.user.name, email: data.user.email, mobile: data.user.mobile,
           role: data.user.role, id: data.user.id };
}

async function apiPlaceOrder(payload){
  return apiFetch('/orders', {method:'POST', body: JSON.stringify(payload)});
}

async function apiSaveProduct(product, isEdit){
  const path = isEdit ? '/admin/products/' + product.id : '/admin/products';
  const method = isEdit ? 'PUT' : 'POST';
  return apiFetch(path, {method, body: JSON.stringify({
    name: product.name, description: product.desc,
    selling_price: product.price, mrp: product.mrp,
    quantity: product.qty, uom_id: product.uomId, category_id: product.catId,
    stock_units: product.stock, badge_label: product.badge,
    is_bestseller: product.bc==='bestseller', is_active: product.active,
    images: product.images||[]
  })});
}

// ═══════════════════════════════════════════════════
// AR / AP / INVENTORY — DATA & LOGIC
// ═══════════════════════════════════════════════════

// ── SUPPLIERS MASTER ──