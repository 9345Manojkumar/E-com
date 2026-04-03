/* Palm Legacy – Data / DB Models */

let UOM_LIST = [
  {id:1, name:"Gram",     short:"g"},
  {id:2, name:"Kilogram", short:"kg"},
  {id:3, name:"Milliliter",short:"ml"},
  {id:4, name:"Liter",    short:"L"},
  {id:5, name:"Piece",    short:"pcs"},
  {id:6, name:"Packet",   short:"pkt"},
  {id:7, name:"Box",      short:"box"},
];

// Category Master (dynamic — admin can add/edit/delete)
let CAT_LIST = [
  {id:1, name:"Jaggery Blocks",  icon:"🟤", bg:"#FFF8E8"},
  {id:2, name:"Jaggery Powder",  icon:"🫙", bg:"#FFF3D0"},
  {id:3, name:"Palm Candy",      icon:"💎", bg:"#F0FFF0"},
  {id:4, name:"Palm Sugar",      icon:"🌟", bg:"#FFF8E8"},
  {id:5, name:"Combo Packs",     icon:"🎁", bg:"#FFF0F5"},
  {id:6, name:"Bulk Packs",      icon:"📦", bg:"#F5F0FF"},
];

// Product Master
let PRODUCTS=[
  {id:1,name:"Palm Jaggery Block",desc:"Traditional Palmyra blocks rich in iron and minerals. Perfect for sweets, cooking & daily use.",price:180,mrp:220,qty:500,uomId:1,catId:1,badge:"Bestseller",bc:"bestseller",rating:4.9,reviews:384,stock:142,sold:384,images:[],active:true},
  {id:2,name:"Palm Jaggery Powder",desc:"Finely ground powder. Blends instantly into tea, coffee, payasam and baked goods.",price:220,mrp:260,qty:500,uomId:1,catId:2,badge:"Popular",bc:"",rating:4.8,reviews:219,images:[],stock:88,sold:219,active:true},
  {id:3,name:"Palm Candy (Kalkandu)",desc:"Crystal-clear candy with a distinct caramel sweetness. A traditional treat for all ages.",price:240,mrp:280,qty:250,uomId:1,catId:3,badge:"Traditional",bc:"",rating:4.9,reviews:156,images:[],stock:12,sold:156,active:true},
  {id:4,name:"Palm Sugar Granules",desc:"100% natural low-GI alternative to cane sugar. Ideal for health-conscious lifestyles.",price:320,mrp:380,qty:400,uomId:1,catId:4,badge:"Healthy",bc:"",rating:4.7,reviews:98,images:[],stock:6,sold:98,active:true},
  {id:5,name:"Family Combo Pack",desc:"Jaggery Block 1kg + Powder 500g + Palm Candy 250g. Best value for the whole family!",price:580,mrp:760,qty:1750,uomId:1,catId:5,badge:"Best Value",bc:"bestseller",rating:5.0,reviews:67,images:[],stock:34,sold:67,active:true},
  {id:6,name:"Bulk Jaggery Block 2kg",desc:"Bulk pack for families and restaurants. Same purity, more savings. Stays fresh 6 months.",price:320,mrp:400,qty:2000,uomId:1,catId:6,badge:"Bulk Pack",bc:"",rating:4.8,reviews:143,images:[],stock:67,sold:143,active:true}
];

// Helpers
function getUOM(id){return UOM_LIST.find(u=>u.id===id)||{name:"Unit",short:"unit"};}
function getCAT(id){return CAT_LIST.find(c=>c.id===id)||{name:"Other",icon:"📦",bg:"#F5F5F5"};}
function prodWeight(p){return p.qty + getUOM(p.uomId).short;}
function nextProdId(){return PRODUCTS.length?Math.max(...PRODUCTS.map(p=>p.id))+1:1;}
function nextUomId(){return UOM_LIST.length?Math.max(...UOM_LIST.map(u=>u.id))+1:1;}
function nextCatId(){return CAT_LIST.length?Math.max(...CAT_LIST.map(c=>c.id))+1:1;}


// Simulated user DB — role determines access
// role: 'customer' | 'viewer' | 'manager' | 'admin'
let userDB = {}; // populated from MySQL on login

// Permissions by role
const PERMS={
  admin:["dashboard","myorders","orders","products","customers","analytics","reports","pricing","ar","ap","inventory","users","settings"],
  manager:["dashboard","myorders","orders","products","customers","analytics","reports","pricing","ar","ap","inventory"],
  viewer:["dashboard","myorders","orders","customers","analytics","ar","ap","inventory"],
  customer:["dashboard","myorders"],
};
const ROLE_LABEL={admin:"👑 Administrator",manager:"📊 Manager",viewer:"👁️ Viewer",customer:"🛒 Customer"};

let ORDERS = []; // loaded from MySQL via /api/admin/orders
let CUSTS = []; // loaded from MySQL via /api/admin/customers (TODO)
const MON_DATA=[{m:"Sep",v:28000},{m:"Oct",v:34000},{m:"Nov",v:42000},{m:"Dec",v:58000},{m:"Jan",v:48000},{m:"Feb",v:52000},{m:"Mar",v:62000}];

let currentUser=null, cart={}, selPay="upi", pendingCheckout=false, otpFlowData={}, ordFilter="all";
let adminUsers=Object.values(userDB);

// ═══════════════════════════════════════════════════
// SCREEN NAVIGATION
// ═══════════════════════════════════════════════════
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0,0);
}
function backToShop(){
  // Restore session from saved JWT token
  const savedToken = getToken();
  if(savedToken){
    try {
      const payload = JSON.parse(atob(savedToken.split('.')[1]));
      if(payload.exp * 1000 > Date.now()){
        currentUser = {id:payload.id, name:payload.name, email:payload.email, mobile:payload.mobile, role:payload.role};
      } else { setToken(null); }
    } catch { setToken(null); }
  }
  showScreen("shopScreen");
  if(currentUser) updateNavAuth();
  detectBackend();  // auto-detect backend & load from DB if running
}
    CAT_LIST  = categories.map(c=>({ id:c.id, name:c.name, icon:c.icon, bg:c.bg_color }));
    UOM_LIST  = uoms.map(u=>({ id:u.id, name:u.name, short:u.short_code }));
    renderProducts();
    console.log(`✅ Loaded ${PRODUCTS.length} products from DB`);
  } catch(e) { console.error('loadFromAPI error:', e.message); }
}

// ── API-backed AUTH ──
let SUPPLIERS = [
  {id:1, name:"Palmyra Farms Co.",   mobile:"9800001111", email:"palmyra@farms.com",   gstin:"33AAAAA0000A1Z5", city:"Madurai",    balance:-24500, type:"supplier"},
  {id:2, name:"Natural Jaggery Ltd", mobile:"9800002222", email:"natural@jaggery.com", gstin:"33BBBBB0000B1Z5", city:"Tirunelveli", balance:-18200, type:"supplier"},
  {id:3, name:"Tamil Palm Corp",     mobile:"9800003333", email:"info@tamilpalm.com",  gstin:"33CCCCC0000C1Z5", city:"Salem",       balance:0,       type:"supplier"},
];

// ── ITEM TRANSACTIONS (Inventory Ledger) ──
// direction: 'in' (inbound) | 'out' (outbound)
let ITEM_TXN = [
  {id:1,  date:"2026-03-01", txnId:"PUR-001",  type:"purchase",      productId:1, qty:500, uomId:2, direction:"in",  rate:120, amount:60000, party:"Palmyra Farms Co.",   ref:"INV-PF-001", notes:"Opening stock"},
  {id:2,  date:"2026-03-01", txnId:"PUR-001",  type:"purchase",      productId:2, qty:300, uomId:2, direction:"in",  rate:140, amount:42000, party:"Palmyra Farms Co.",   ref:"INV-PF-001", notes:"Opening stock"},
  {id:3,  date:"2026-03-05", txnId:"SAL-001",  type:"sale",          productId:1, qty:50,  uomId:2, direction:"out", rate:180, amount:9000,  party:"Radha Krishnan",      ref:"PL-100290",  notes:"Customer order"},
  {id:4,  date:"2026-03-05", txnId:"SAL-001",  type:"sale",          productId:2, qty:30,  uomId:2, direction:"out", rate:220, amount:6600,  party:"Radha Krishnan",      ref:"PL-100290",  notes:"Customer order"},
  {id:5,  date:"2026-03-08", txnId:"PUR-002",  type:"purchase",      productId:3, qty:200, uomId:2, direction:"in",  rate:160, amount:32000, party:"Natural Jaggery Ltd", ref:"INV-NJ-042", notes:""},
  {id:6,  date:"2026-03-10", txnId:"SAL-002",  type:"sale",          productId:1, qty:80,  uomId:2, direction:"out", rate:180, amount:14400, party:"Karthik Babu",        ref:"PL-100306",  notes:"Bulk order"},
  {id:7,  date:"2026-03-11", txnId:"ADJ-001",  type:"adjust",        productId:4, qty:10,  uomId:2, direction:"in",  rate:0,   amount:0,     party:"Admin",               ref:"ADJ-001",    notes:"Stock count correction"},
  {id:8,  date:"2026-03-12", txnId:"SAL-003",  type:"sale",          productId:5, qty:10,  uomId:2, direction:"out", rate:580, amount:5800,  party:"Anitha Selvam",       ref:"PL-100309",  notes:""},
  {id:9,  date:"2026-03-13", txnId:"PUR-003",  type:"purchase",      productId:1, qty:200, uomId:2, direction:"in",  rate:120, amount:24000, party:"Tamil Palm Corp",     ref:"INV-TC-018", notes:"Restock"},
  {id:10, date:"2026-03-13", txnId:"RET-001",  type:"sale_return",   productId:2, qty:5,   uomId:2, direction:"in",  rate:220, amount:1100,  party:"Meena Chandran",      ref:"PL-100305",  notes:"Damaged goods returned"},
];

// ── AR TRANSACTIONS (Accounts Receivable) ──
let AR_TXN = [
  {id:1,  date:"2026-03-05", type:"sale",    party:"Radha Krishnan",      ref:"PL-100290", debit:15600, credit:0,     balance:15600, paymode:"credit", due:"2026-03-20", status:"partial",   notes:"Customer order #290"},
  {id:2,  date:"2026-03-07", type:"receipt", party:"Radha Krishnan",      ref:"RCP-001",   debit:0,     credit:10000, balance:5600,  paymode:"upi",    due:null,          status:"posted",    notes:"Partial payment received"},
  {id:3,  date:"2026-03-11", type:"sale",    party:"Karthik Babu",        ref:"PL-100306", debit:1160,  credit:0,     balance:1160,  paymode:"upi",    due:null,          status:"paid",      notes:""},
  {id:4,  date:"2026-03-11", type:"receipt", party:"Karthik Babu",        ref:"RCP-002",   debit:0,     credit:1160,  balance:0,     paymode:"upi",    due:null,          status:"posted",    notes:"Full payment - UPI"},
  {id:5,  date:"2026-03-12", type:"sale",    party:"Anitha Selvam",       ref:"PL-100309", debit:5800,  credit:0,     balance:5800,  paymode:"credit", due:"2026-04-01",  status:"posted",    notes:"Net 15 credit"},
  {id:6,  date:"2026-03-13", type:"sale",    party:"Priya Subramaniam",   ref:"PL-100311", debit:629,   credit:0,     balance:629,   paymode:"card",   due:null,          status:"paid",      notes:""},
  {id:7,  date:"2026-03-13", type:"receipt", party:"Priya Subramaniam",   ref:"RCP-003",   debit:0,     credit:629,   balance:0,     paymode:"card",   due:null,          status:"posted",    notes:"Card payment"},
  {id:8,  date:"2026-03-13", type:"sale_return", party:"Meena Chandran",  ref:"CN-001",    debit:0,     credit:269,   balance:0,     paymode:"credit", due:null,          status:"posted",    notes:"Order cancelled - credit note"},
];

// ── AP TRANSACTIONS (Accounts Payable) ──
let AP_TXN = [
  {id:1,  date:"2026-03-01", type:"purchase", party:"Palmyra Farms Co.",   ref:"INV-PF-001", debit:0,     credit:102000, balance:102000, paymode:"credit", due:"2026-03-31", status:"partial", notes:"March stock purchase"},
  {id:2,  date:"2026-03-03", type:"payment",  party:"Palmyra Farms Co.",   ref:"PAY-001",    debit:77500, credit:0,      balance:24500,  paymode:"bank",   due:null,          status:"posted",  notes:"Part payment via NEFT"},
  {id:3,  date:"2026-03-08", type:"purchase", party:"Natural Jaggery Ltd", ref:"INV-NJ-042", debit:0,     credit:32000,  balance:32000,  paymode:"credit", due:"2026-04-08", status:"posted",  notes:"Palm candy stock"},
  {id:4,  date:"2026-03-10", type:"payment",  party:"Natural Jaggery Ltd", ref:"PAY-002",    debit:13800, credit:0,      balance:18200,  paymode:"upi",    due:null,          status:"posted",  notes:"Partial payment"},
  {id:5,  date:"2026-03-13", type:"purchase", party:"Tamil Palm Corp",     ref:"INV-TC-018", debit:0,     credit:24000,  balance:24000,  paymode:"credit", due:"2026-04-13", status:"posted",  notes:"Restock purchase"},
  {id:6,  date:"2026-03-13", type:"payment",  party:"Tamil Palm Corp",     ref:"PAY-003",    debit:24000, credit:0,      balance:0,      paymode:"bank",   due:null,          status:"posted",  notes:"Full payment"},
];

let _txnLines = []; // current modal item lines
let _txnLineId = 1;

// ── COMPUTE RUNNING BALANCES ──
        ${UOM_LIST.map(u=>`<option value="${u.id}" ${l.uomId==u.id?"selected":""}>${u.short}</option>`).join("")}
      </select>
      <input type="number" min="0" value="${l.rate||""}" placeholder="Rate" onchange="onTxnLineChange(${l.id},'rate',this.value)" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:right;outline:none"/>
      <div style="font-size:12px;font-weight:700;color:var(--brown-dark);text-align:right">₹${(l.amount||0).toLocaleString()}</div>
      <button onclick="removeTxnLine(${l.id})" style="background:var(--red-light);color:var(--red);border:none;border-radius:5px;width:24px;height:24px;cursor:pointer;font-size:14px">✕</button>
    </div>`).join("");
  calcTxnTotal();
}

function onTxnProductChange(lineId, productId){
  const l=_txnLines.find(x=>x.id===lineId);
  if(!l)return;
  const p=PRODUCTS.find(x=>x.id===parseInt(productId));
  l.productId=parseInt(productId)||"";
  if(p){ l.uomId=p.uomId; l.rate=p.price; l.amount=l.rate*l.qty; }
  renderTxnLines();
}

function onTxnLineChange(lineId, field, val){
  const l=_txnLines.find(x=>x.id===lineId);
  if(!l)return;
  l[field]=field==="uomId"?parseInt(val):parseFloat(val)||0;
  l.amount=l.rate*l.qty;
  renderTxnLines();
}

function calcTxnTotal(){
  const total=_txnLines.reduce((s,l)=>s+l.amount,0);
  const amountEl=document.getElementById("txn_amount");
  const sub=document.getElementById("txn_subtotal");
  if(sub) sub.textContent="₹"+total.toLocaleString();
  return total;
}

let POLICIES = [
  {id:1, type:"offer",  name:"Weekend Special",       dtype:"percent", percent:15, override:null, cap:100,  scope:"all",      scopeId:null, minOrder:null, code:null,       totalUses:null, perUser:null, usedCount:0, from:"2026-03-01", to:"2026-03-31", active:true},
  {id:2, type:"promo",  name:"Welcome Offer",          dtype:"percent", percent:10, override:null, cap:50,   scope:"all",      scopeId:null, minOrder:null, code:"WELCOME10", totalUses:500,  perUser:1,    usedCount:23, from:"2026-01-01", to:"2026-12-31", active:true},
  {id:3, type:"promo",  name:"Diwali Special",         dtype:"percent", percent:20, override:null, cap:200,  scope:"category", scopeId:1,    minOrder:null, code:"DIWALI20",  totalUses:200,  perUser:2,    usedCount:145, from:"2026-10-01", to:"2026-11-15", active:false},
  {id:4, type:"offer",  name:"Bulk Buy Deal",          dtype:"override",percent:null,override:280, cap:null, scope:"product",  scopeId:1,    minOrder:null, code:null,        totalUses:null, perUser:null, usedCount:0, from:"2026-03-10", to:"2026-03-20", active:true},
  {id:5, type:"promo",  name:"Min ₹500 Cart Discount", dtype:"percent", percent:12, override:null, cap:80,   scope:"min_order",scopeId:null, minOrder:500, code:"SAVE12",    totalUses:null,  perUser:null, usedCount:67, from:"2026-03-01", to:"2026-06-30", active:true},
];

let _appliedPromo = null;   // currently applied promo in checkout
let _policyFilter = "all";

function nextPolicyId(){return POLICIES.length?Math.max(...POLICIES.map(p=>p.id))+1:1;}

// ── Compute effective price for a product ──
  document.getElementById("pmol_cat_scope").innerHTML=CAT_LIST.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("pmol_prod_scope").innerHTML=PRODUCTS.map(pr=>`<option value="${pr.id}">${pr.name}</option>`).join("");
  // Set defaults or existing values
  const today=new Date().toISOString().split("T")[0];
  const nextMonth=new Date(Date.now()+30*864e5).toISOString().split("T")[0];
  selectPolicyType(p?p.type:defaultType||"offer");
  selectDiscountType(p?p.dtype:"percent");
  document.getElementById("pmol_name").value=p?p.name:"";
  document.getElementById("pmol_code").value=p?p.code||"":"";
  document.getElementById("pmol_percent").value=p&&p.percent?p.percent:"";
  document.getElementById("pmol_override").value=p&&p.override?p.override:"";
  document.getElementById("pmol_cap").value=p&&p.cap?p.cap:"";
  document.getElementById("pmol_scope").value=p?p.scope:"all";
  if(p&&p.scopeId){document.getElementById("pmol_cat_scope").value=p.scopeId;document.getElementById("pmol_prod_scope").value=p.scopeId;}
  document.getElementById("pmol_minorder").value=p&&p.minOrder?p.minOrder:"";
  document.getElementById("pmol_from").value=p?p.from:today;
  document.getElementById("pmol_to").value=p?p.to:nextMonth;
  document.getElementById("pmol_total_uses").value=p&&p.totalUses?p.totalUses:"";
  document.getElementById("pmol_per_user").value=p&&p.perUser?p.perUser:"";
  document.getElementById("pmol_active").checked=p?(p.active!==false):true;
  onScopeChange();previewDiscount();
  document.getElementById("policyModal").classList.add("open");
}
function closePolicyModal(){document.getElementById("policyModal").classList.remove("open");}

      +CAT_LIST.map(c=>`<div class="fb" onclick="filterProds(${c.id},this)">${c.icon} ${c.name}</div>`).join("")
      +(canEdit?`<button class="abtn abtn-p abtn-sm" style="margin-left:auto" onclick="openCatModal()">+ Category</button>`:"");
  }
  renderProdGrid("all");
}

  uomSel.innerHTML=UOM_LIST.map(u=>`<option value="${u.id}" ${p&&p.uomId===u.id?"selected":""}>${u.name} (${u.short})</option>`).join("");
  // Populate category dropdown
  const catSel=document.getElementById("pm_cat");
  catSel.innerHTML=CAT_LIST.map(c=>`<option value="${c.id}" ${p&&p.catId===c.id?"selected":""}>${c.icon} ${c.name}</option>`).join("");
  // Load existing images into thumbs
  renderImgThumbs(p ? (p.images||[]) : []);
  document.getElementById("prodModal").classList.add("open");
}
function closeProdModal(){document.getElementById("prodModal").classList.remove("open");}

  const c=id?CAT_LIST.find(x=>x.id===id):null;
  document.getElementById("cmTitle").textContent=c?"Edit Category":"Category Master";
  document.getElementById("cm_id").value=c?c.id:"";
  document.getElementById("cm_name").value=c?c.name:"";
  document.getElementById("cm_icon").value=c?c.icon:"📦";
  document.getElementById("cm_bg").value=c?c.bg:"#FFF8E8";
  // Render existing cats list
  const listEl=document.getElementById("catListMgr");
  if(listEl){listEl.innerHTML=CAT_LIST.map(ct=>`<div style="display:flex;align-items:center;gap:8px;background:var(--bg-admin);border-radius:8px;padding:8px 12px;border:1px solid var(--border)"><span style="font-size:18px">${ct.icon}</span><div style="flex:1;font-size:12px;font-weight:700;color:var(--brown-dark)">${ct.name}</div><div style="width:18px;height:18px;border-radius:4px;background:${ct.bg};border:1px solid var(--border)"></div><button class="abtn abtn-o abtn-sm" onclick="openCatModal(${ct.id})">✏️</button><button class="abtn abtn-d abtn-sm" onclick="deleteCat(${ct.id})" ${PRODUCTS.some(p=>p.catId===ct.id)?"disabled":""}>🗑</button></div>`).join("");}
  document.getElementById("catModal").classList.add("open");
}
function closeCatModal(){document.getElementById("catModal").classList.remove("open");}
    const c=CAT_LIST.find(x=>x.id===editId);
    if(c){c.name=name;c.icon=icon;c.bg=bg;}
    showAdminToast("✅ Category updated!");
  } else {
    CAT_LIST.push({id:nextCatId(),name,icon,bg});
    showAdminToast("✅ Category added!");
  }
  closeCatModal();buildProds();renderProducts();
}
  CAT_LIST=CAT_LIST.filter(c=>c.id!==id);
  buildProds();renderProducts();showAdminToast("🗑 Category deleted");
}

// ── UOM MODAL ──
  const u=id?UOM_LIST.find(x=>x.id===id):null;
  document.getElementById("umTitle").textContent=u?"Edit UOM":"UOM Master";
  document.getElementById("um2_id").value=u?u.id:"";
  document.getElementById("um2_name").value=u?u.name:"";
  document.getElementById("um2_short").value=u?u.short:"";
  // Render existing UOMs list
  const listEl=document.getElementById("uomListMgr");
  if(listEl){listEl.innerHTML=UOM_LIST.map(um=>`<div style="display:flex;align-items:center;gap:8px;background:var(--bg-admin);border-radius:8px;padding:8px 12px;border:1px solid var(--border)"><div style="flex:1;font-size:12px;font-weight:700;color:var(--brown-dark)">${um.name}</div><span style="background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${um.short}</span><button class="abtn abtn-o abtn-sm" onclick="openUomModal(${um.id})">✏️</button><button class="abtn abtn-d abtn-sm" onclick="deleteUom(${um.id})" ${PRODUCTS.some(p=>p.uomId===um.id)?"disabled":""}>🗑</button></div>`).join("");}
  document.getElementById("uomModal").classList.add("open");
}
function closeUomModal(){document.getElementById("uomModal").classList.remove("open");}
    const u=UOM_LIST.find(x=>x.id===editId);
    if(u){u.name=name;u.short=short;}
    showAdminToast("✅ UOM updated!");
  } else {
    UOM_LIST.push({id:nextUomId(),name,short});
    showAdminToast("✅ UOM added!");
  }
  closeUomModal();buildProds();
}
  UOM_LIST=UOM_LIST.filter(u=>u.id!==id);
  showAdminToast("🗑 UOM deleted");closeUomModal();buildProds();
}

// ── PRODUCT PAGE TABS ──
  <tbody>${CAT_LIST.map(c=>{
    const count=PRODUCTS.filter(p=>p.catId===c.id).length;
    return`<tr>
      <td style="font-size:11px;color:var(--text-light)">${c.id}</td>
      <td style="font-size:22px">${c.icon}</td>
      <td><div class="tn">${c.name}</div></td>
      <td><div style="width:28px;height:28px;border-radius:6px;background:${c.bg};border:1px solid var(--border)"></div></td>
      <td><strong>${count}</strong></td>
      ${canEdit?`<td><div style="display:flex;gap:5px">
        <button class="abtn abtn-o abtn-sm" onclick="openCatModal(${c.id})">✏️ Edit</button>
        <button class="abtn abtn-d abtn-sm" onclick="deleteCat(${c.id})" ${count>0?"disabled title='Has products'":""}>🗑</button>
      </div></td>`:""}
    </tr>`;
  }).join("")}</tbody>`;
}

  <tbody>${UOM_LIST.map(u=>{
    const count=PRODUCTS.filter(p=>p.uomId===u.id).length;
    return`<tr>
      <td style="font-size:11px;color:var(--text-light)">${u.id}</td>
      <td><div class="tn">${u.name}</div></td>
      <td><span style="background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${u.short}</span></td>
      <td><strong>${count}</strong> ${count>0?`<span style="font-size:10px;color:var(--text-light)">(${PRODUCTS.filter(p=>p.uomId===u.id).map(p=>p.name).join(", ").substring(0,40)}${count>2?"…":""})</span>`:"—"}</td>
      ${canEdit?`<td><div style="display:flex;gap:5px">
        <button class="abtn abtn-o abtn-sm" onclick="openUomModal(${u.id})">✏️ Edit</button>
        <button class="abtn abtn-d abtn-sm" onclick="deleteUom(${u.id})" ${count>0?"disabled title='In use'":""}>🗑</button>
      </div></td>`:""}
    </tr>`;
  }).join("")}</tbody>`;
}


// CUSTOMERS