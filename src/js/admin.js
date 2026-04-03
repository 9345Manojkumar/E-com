// Safely render items array from API (avoids [object Object])
function formatOrderItems(items){
  if(!items) return '—';
  try {
    const arr = typeof items === 'string' ? JSON.parse(items) : items;
    if(!Array.isArray(arr) || !arr.length) return '—';
    return arr.map(i=>i.name+' × '+i.qty).join(', ');
  } catch { return String(items); }
}

/* Palm Legacy – Admin Dashboard */

function initAdminScreen(){
  if(!currentUser)return;
  const role=currentUser.role;
  const ini=currentUser.name.split(" ").map(w=>w[0]).join("").substring(0,2).toUpperCase();
  document.getElementById("sbAvatar").textContent=ini;
  document.getElementById("sbName").textContent=currentUser.name;
  document.getElementById("sbRole").textContent=ROLE_LABEL[role]||role;
  document.getElementById("aRoleChip").textContent=ROLE_LABEL[role]||role;

  // ── Role-based sidebar: HIDE sections completely — never blur for customer ──
  const allowed = PERMS[role] || ["dashboard","myorders"];
  const hasAdmin    = ["admin","manager","viewer"].includes(role);
  const hasFinance  = ["admin","manager","viewer"].includes(role);
  const hasSettings = ["admin","manager"].includes(role);

  // Hide/show entire Admin section
  document.querySelectorAll(".sb-sec-admin, .sb-admin-item").forEach(el=>{
    el.style.display = hasAdmin ? "" : "none";
  });
  // Hide/show entire Finance section
  document.querySelectorAll(".sb-sec-finance, .sb-finance-item").forEach(el=>{
    el.style.display = hasFinance ? "" : "none";
  });
  // Hide/show entire Settings section
  document.querySelectorAll(".sb-sec-settings, .sb-settings-item").forEach(el=>{
    el.style.display = hasSettings ? "" : "none";
  });

  // Within visible sections — hide individual items not in permission list
  document.querySelectorAll(".sb-item[data-page]").forEach(el=>{
    const p = el.getAttribute("data-page");
    if(["dashboard","myorders"].includes(p)){ el.style.display=""; el.classList.remove("locked"); return; }
    if(!allowed.includes(p)){
      el.style.display = "none"; // hide completely — no blur
      el.classList.remove("locked");
    } else {
      el.style.display = "";
      el.classList.remove("locked");
    }
  });

  // Hide section headers if all their items ended up hidden
  ["admin","finance","settings"].forEach(sec=>{
    const header = document.querySelector(".sb-sec-"+sec);
    const items  = document.querySelectorAll(".sb-"+sec+"-item");
    if(header && items.length){
      const anyVisible = Array.from(items).some(i=>i.style.display!=="none");
      header.style.display = anyVisible ? "" : "none";
    }
  });
  buildDash();buildMyOrders();buildOrders();buildProds();buildCusts();buildAnalytics();buildReports();buildPricing();buildAR();buildAP();buildInventory();buildUsers();buildSettings();
  showAPage("dashboard");
}

function showAPage(p){
  const role=currentUser?.role||"customer";
  const allowed=PERMS[role]||["dashboard","myorders"];
  if(!allowed.includes(p)){showAdminToast("🔒 Access restricted for your role");return;}
  document.querySelectorAll(".apage").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".sb-item").forEach(x=>x.classList.remove("active"));
  document.getElementById("apage-"+p).classList.add("active");
  const el=document.querySelector(`.sb-item[data-page="${p}"]`);if(el)el.classList.add("active");
  const t={dashboard:"Dashboard",myorders:"My Orders",orders:"All Orders",products:"Products",customers:"Customers",analytics:"Analytics",reports:"Reports",pricing:"Pricing Policy",ar:"AR – Accounts Receivable",ap:"AP – Accounts Payable",inventory:"Inventory Ledger",users:"User Access",settings:"Settings"};
  document.getElementById("aTopbarTitle").textContent=t[p]||p;
  closeSidebar();
}

// DASHBOARD
function buildDash(){
  const role=currentUser?.role||"customer";
  const u=currentUser;
  const ini=u.name.split(" ").map(w=>w[0]).join("").substring(0,2).toUpperCase();
  const roleLabel={admin:"👑 Administrator",manager:"📊 Manager",viewer:"👁️ Viewer",customer:"🛒 Customer"}[role]||role;
  const navLinks={
    admin:[{icon:"📋",label:"All Orders",page:"orders"},{icon:"🟤",label:"Products",page:"products"},{icon:"👥",label:"Customers",page:"customers"},{icon:"📈",label:"Analytics",page:"analytics"},{icon:"🔐",label:"User Access",page:"users"}],
    manager:[{icon:"📋",label:"All Orders",page:"orders"},{icon:"🟤",label:"Products",page:"products"},{icon:"👥",label:"Customers",page:"customers"},{icon:"📈",label:"Analytics",page:"analytics"}],
    viewer:[{icon:"📋",label:"All Orders",page:"orders"},{icon:"👥",label:"Customers",page:"customers"},{icon:"📈",label:"Analytics",page:"analytics"}],
    customer:[{icon:"📦",label:"My Orders",page:"myorders"},{icon:"🛒",label:"Shop Now",page:"__shop"}],
  }[role]||[];
  document.getElementById("dashWelcome").innerHTML=`
    <div style="max-width:560px;margin:0 auto;padding:20px 0">
      <div style="background:#fff;border-radius:16px;border:1px solid var(--border);overflow:hidden;margin-bottom:18px">
        <div style="background:linear-gradient(135deg,var(--brown-dark),#5c2e08);padding:28px 28px 24px;display:flex;align-items:center;gap:18px">
          <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--brown-mid));display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:20px;font-weight:800;color:#fff;flex-shrink:0">${ini}</div>
          <div>
            <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:800;color:var(--gold-light);margin-bottom:4px">${u.name}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.6)">${u.email||u.mobile||""}</div>
            <div style="margin-top:6px"><span style="background:rgba(212,148,10,.2);border:1px solid rgba(212,148,10,.4);border-radius:20px;padding:3px 12px;font-size:11px;color:var(--gold-light);font-family:'Cinzel',serif;letter-spacing:1px">${roleLabel}</span></div>
          </div>
        </div>
        <div style="padding:20px 26px">
          <div style="font-family:'Cinzel',serif;font-size:11px;font-weight:700;color:var(--text-light);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Quick Actions</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
            ${navLinks.map(l=>`<div onclick="${l.page==="__shop"?"backToShop()":"showAPage('"+l.page+"')"}" style="background:var(--bg-admin);border:1px solid var(--border);border-radius:10px;padding:14px 12px;cursor:pointer;transition:all .2s;text-align:center" onmouseover="this.style.borderColor='var(--gold)';this.style.background='var(--gold-pale)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-admin)'">
              <div style="font-size:24px;margin-bottom:6px">${l.icon}</div>
              <div style="font-size:11px;font-weight:700;color:var(--brown-dark)">${l.label}</div>
            </div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
}

// MY ORDERS
function buildMyOrders(){
  if(!currentUser) return;
  apiFetch('/orders/my')
    .then(data=>{
      const list = data.map(o=>({
        id: o.order_number||o.id,
        items: formatOrderItems(o.items),
        amount: parseFloat(o.grand_total||o.amount||0),
        status: o.order_status||o.status,
        date: (o.ordered_at||o.date||"").substring(0,10)
      }));
      document.getElementById("myOrdersTable").innerHTML=
        `<thead><tr><th>Order ID</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${list.length
          ? list.map(o=>`<tr>
              <td><div class="tn">${o.id}</div></td>
              <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items}</td>
              <td><strong>₹${o.amount}</strong></td>
              <td>${sb(o.status)}</td>
              <td style="font-size:10px;color:var(--text-light)">${o.date}</td>
            </tr>`).join("")
          : `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-light);font-style:italic">No orders yet. <a onclick="backToShop()" style="color:var(--gold);cursor:pointer;font-weight:700">Shop now →</a></td></tr>`
        }</tbody>`;
    })
    .catch(()=>{
      document.getElementById("myOrdersTable").innerHTML=
        `<thead><tr><th>Order ID</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody><tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-light)">Could not load orders.</td></tr></tbody>`;
    });
}

// ALL ORDERS
function buildOrders(f="all"){
  ordFilter=f;
  const role=currentUser?.role||"customer";
  const canView=["admin","manager","viewer"].includes(role);
  document.getElementById("ordersContent").style.display=canView?"block":"none";
  document.getElementById("ordersDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const canEdit=["admin","manager"].includes(role);
  const param=f==="all"?"":"?status="+f;
  apiFetch('/admin/orders'+param)
    .then(data=>{
      ORDERS=data.map(o=>({
        dbId:o.id,
        id:o.order_number||o.id, customer:o.customer_name,
        mobile:o.customer_mobile, email:o.customer_email||"",
        items:formatOrderItems(o.items), amount:parseFloat(o.grand_total),
        status:o.order_status, date:(o.ordered_at||"").substring(0,10),
        city:o.city||"", state:o.state||"", pin:o.pincode||"",
        pay:(o.payment_method||"").toUpperCase()
      }));
      document.getElementById("ordCnt").textContent="("+ORDERS.length+")";
      if(typeof updateOrderBadge==='function') updateOrderBadge();
      document.getElementById("ordersTable").innerHTML=`<thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Amount</th><th>Pay</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>${ORDERS.map(o=>`<tr><td><div class="tn">${o.id}</div></td><td><div class="tn">${o.customer}</div><div class="ts">${o.mobile}</div></td><td style="font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items}</td><td><strong>₹${o.amount}</strong></td><td style="font-size:10px;color:var(--text-light)">${o.pay}</td><td>${sb(o.status)}</td><td style="font-size:10px;color:var(--text-light)">${o.date}</td><td style="display:flex;gap:5px"><button class="abtn abtn-o abtn-sm" onclick="openPanel('${o.id}')">View</button>${canEdit?`<button class="abtn abtn-sm" style="background:var(--gold-pale);color:var(--brown-dark);border:1px solid var(--gold)" onclick="openPanel('${o.id}')">Edit</button>`:""}</td></tr>`).join("")}</tbody>`;
    })
    .catch(err=>console.error('orders:',err.message));
}
function filterOrders(f,el){ordFilter=f;document.querySelectorAll(".filter-bar .fb").forEach(b=>b.classList.remove("active"));el.classList.add("active");buildOrders(f);}

// ORDER PANEL
function openPanel(id){
  const o=ORDERS.find(x=>x.id===id);if(!o)return;
  const canEdit=["admin","manager"].includes(currentUser?.role);
  document.getElementById("dpTitle").textContent="Order "+o.id;
  document.getElementById("dpBody").innerHTML=`
    <div class="dp-sec"><h4>Order Info</h4><div class="dp-row"><span>Order ID</span><span>${o.id}</span></div><div class="dp-row"><span>Date</span><span>${o.date}</span></div><div class="dp-row"><span>Payment</span><span>${o.pay}</span></div><div class="dp-row"><span>Total</span><span style="color:var(--green-dark);font-size:15px">₹${o.amount}</span></div></div>
    <div class="dp-sec"><h4>Customer</h4><div class="dp-row"><span>Name</span><span>${o.customer}</span></div><div class="dp-row"><span>Mobile</span><span>${o.mobile}</span></div><div class="dp-row"><span>Email</span><span>${o.email}</span></div><div class="dp-row"><span>Location</span><span>${o.city}, ${o.state} – ${o.pin}</span></div></div>
    <div class="dp-sec"><h4>Items</h4><div style="background:var(--cream);border-radius:7px;padding:9px 12px;font-size:12px;line-height:1.8">${o.items}</div></div>
    <div class="dp-sec"><h4>Status</h4>${canEdit?`<select class="ssel" onchange="updStatus('${o.id}',this.value)"><option value="pending" ${o.status==="pending"?"selected":""}>⏳ Pending</option><option value="processing" ${o.status==="processing"?"selected":""}>⚙️ Processing</option><option value="shipped" ${o.status==="shipped"?"selected":""}>🚚 Shipped</option><option value="delivered" ${o.status==="delivered"?"selected":""}>✅ Delivered</option><option value="cancelled" ${o.status==="cancelled"?"selected":""}>❌ Cancelled</option></select>`:sb(o.status)}</div>
    ${canEdit?`<div style="display:flex;gap:8px;margin-top:8px"><button class="abtn abtn-s" style="flex:1" onclick="showAdminToast('📧 Invoice sent!')">📧 Invoice</button><button class="abtn abtn-o" style="flex:1" onclick="showAdminToast('🔔 Notified!')">🔔 Notify</button></div>`:""}`;
  document.getElementById("detPanel").classList.add("open");
  document.getElementById("dpanelOv").classList.add("open");
  if(o.dbId && typeof markOrdersSeen==='function') markOrdersSeen([o.dbId]);
}
function updStatus(displayId, s){
  const o = ORDERS.find(x => x.id === displayId);
  if (!o) { showAdminToast('⚠️ Order not found'); return; }
  apiFetch('/admin/orders/' + o.dbId + '/status', {method:'PATCH', body:JSON.stringify({order_status:s})})
    .then(()=>{
      o.status = s;
      buildOrders(ordFilter); buildDash();
      if(typeof updateOrderBadge==='function') updateOrderBadge();
      showAdminToast('✅ Status updated → ' + s);
    })
    .catch(err => showAdminToast('⚠️ ' + err.message));
}
function closePanel(){document.getElementById("detPanel").classList.remove("open");document.getElementById("dpanelOv").classList.remove("open");}

// PRODUCTS
function buildCusts(){
  const role=currentUser?.role||"customer";
  const canView=["admin","manager","viewer"].includes(role);
  document.getElementById("custsContent").style.display=canView?"block":"none";
  document.getElementById("custsDenied").style.display=canView?"none":"block";
  if(!canView)return;
  document.getElementById("custCnt").textContent=CUSTS.length+" registered";
  document.getElementById("custTable").innerHTML=`<thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Spent</th><th>City</th><th>Joined</th></tr></thead><tbody>${CUSTS.map(c=>`<tr><td><div class="u-row"><div class="ua-sm">${c.name[0]}</div><div class="tn">${c.name}</div></div></td><td><div style="font-size:11px;font-weight:700">${c.mobile}</div><div class="ts">${c.email}</div></td><td><strong>${c.orders}</strong></td><td><strong style="color:var(--green-dark)">₹${c.spent.toLocaleString()}</strong></td><td style="font-size:11px;color:var(--text-light)">${c.city}</td><td style="font-size:11px;color:var(--text-light)">${c.joined}</td></tr>`).join("")}</tbody>`;
}

// ANALYTICS
function buildAnalytics(){
  const role=currentUser?.role||"customer";
  const canView=["admin","manager"].includes(role);
  document.getElementById("analyticsContent").style.display=canView?"block":"none";
  document.getElementById("analyticsDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const mx=Math.max(...MON_DATA.map(d=>d.v));
  document.getElementById("monthChart").innerHTML=MON_DATA.map(d=>`<div class="bar-col"><div class="bar-val">₹${(d.v/1000).toFixed(0)}k</div><div class="bar" style="height:${(d.v/mx)*120}px;${d.m==="Mar"?"background:linear-gradient(to top,var(--gold),var(--gold-light));":""}"></div><div class="bar-label">${d.m}</div></div>`).join("");
  document.getElementById("topProds").innerHTML=[...PRODUCTS].sort((a,b)=>b.sold-a.sold).map((p,i)=>{const cat=getCAT(p.catId);return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px"><div style="font-family:'Cinzel',serif;font-size:11px;font-weight:800;color:var(--text-light);width:12px">${i+1}</div><div style="font-size:16px">${cat.icon}</div><div style="flex:1"><div style="font-size:11px;font-weight:700;color:var(--brown-dark)">${p.name}</div><div style="height:3px;background:var(--cream-dark);border-radius:2px;margin-top:3px"><div style="height:100%;width:${(p.sold/400)*100}%;background:linear-gradient(to right,var(--brown-dark),var(--brown-mid));border-radius:2px"></div></div></div><div style="font-size:11px;font-weight:700;color:var(--green-dark)">${p.sold}</div></div>`}).join("");
}

// REPORTS
function buildReports(){
  const role=currentUser?.role||"customer";
  const canView=["admin","manager"].includes(role);
  document.getElementById("reportsContent").style.display=canView?"block":"none";
  document.getElementById("reportsDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const rpts=[{n:"Sales Report – March 2026",d:"Daily revenue breakdown, top products",i:"📊"},{n:"Customer Report – Q1 2026",d:"Signups, repeat buyers, churn",i:"👥"},{n:"Inventory Report",d:"Stock levels, low stock alerts",i:"📦"},{n:"Payment Report",d:"UPI/Card/COD split",i:"💰"},{n:"Delivery Report",d:"Success rate, delays",i:"🚚"}];
  document.getElementById("rptList").innerHTML=rpts.map(r=>`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-admin);border-radius:9px;padding:12px 14px;border:1px solid var(--border)"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">${r.i}</span><div><div style="font-weight:700;font-size:12px;color:var(--brown-dark)">${r.n}</div><div style="font-size:10px;color:var(--text-light);margin-top:2px">${r.d}</div></div></div><button class="abtn abtn-o abtn-sm" onclick="showAdminToast('⬇ Downloading…')">⬇ Download</button></div>`).join("");
}

// USERS
function buildUsers(){
  const role=currentUser?.role||"customer";
  const isAdmin=role==="admin";
  document.getElementById("usersContent").style.display=isAdmin?"block":"none";
  document.getElementById("usersDenied").style.display=isAdmin?"none":"block";
  if(!isAdmin)return;
  adminUsers=Object.values(userDB);
  document.getElementById("usrCnt").textContent=adminUsers.length+" users";
  document.getElementById("usrTable").innerHTML=`<thead><tr><th>User</th><th>Email</th><th>Mobile</th><th>Role</th><th>Actions</th></tr></thead><tbody>${adminUsers.map(u=>`<tr><td><div class="u-row"><div class="ua-sm">${u.name[0]}</div><div class="tn">${u.name}</div></div></td><td style="font-size:11px;color:var(--text-light)">${u.email||"—"}</td><td style="font-size:11px;color:var(--text-light)">${u.mobile||"—"}</td><td>${rb(u.role)}</td><td><div style="display:flex;gap:5px"><select class="ssel" style="width:110px;font-size:10px;padding:3px 6px" onchange="chgRole('${u.email||u.mobile}',this.value)"><option value="admin" ${u.role==="admin"?"selected":""}>👑 Admin</option><option value="manager" ${u.role==="manager"?"selected":""}>📊 Manager</option><option value="viewer" ${u.role==="viewer"?"selected":""}>👁️ Viewer</option><option value="customer" ${u.role==="customer"?"selected":""}>🛒 Customer</option></select><button class="abtn abtn-d abtn-sm" onclick="rmUsr('${u.email||u.mobile}')">Remove</button></div></td></tr>`).join("")}</tbody>`;
}
function chgRole(key,r){
  const u=userDB[key]||Object.values(userDB).find(x=>x.mobile===key);
  if(u){u.role=r;buildUsers();showAdminToast("✅ "+u.name+" → "+ROLE_LABEL[r]);
    // If changing current user's role, refresh nav
    if(currentUser&&(currentUser.email===key||currentUser.mobile===key)){currentUser.role=r;updateNavAuth();}
  }
}
function rmUsr(key){
  const u=userDB[key]||Object.values(userDB).find(x=>x.mobile===key);
  if(u&&u.role==="admin"&&Object.values(userDB).filter(x=>x.role==="admin").length<=1){showAdminToast("⚠️ Cannot remove last admin");return;}
  const delKey=u?.email||key;
  if(userDB[delKey])delete userDB[delKey];
  buildUsers();showAdminToast("🗑 User removed");
}
function openUsrModal(){document.getElementById("usrModal").classList.add("open");}
function closeUsrModal(){document.getElementById("usrModal").classList.remove("open");}
function saveUsr(){
  const fn=document.getElementById("um_fn").value.trim(),em=document.getElementById("um_em").value.trim().toLowerCase(),r=document.getElementById("um_role").value,pw=document.getElementById("um_pwd").value;
  if(!fn||!em){showAdminToast("⚠️ Fill name and email");return;}
  const ln=document.getElementById("um_ln").value.trim();
  if(userDB[em]){userDB[em].role=r;if(pw)userDB[em].pwd=pw;}
  else{userDB[em]={name:fn+(ln?" "+ln:""),email:em,mobile:"",pwd:pw||"changeme",role:r};}
  buildUsers();closeUsrModal();showAdminToast("✅ "+fn+" saved as "+ROLE_LABEL[r]);
}

// SETTINGS
function buildSettings(){
  const isAdmin=currentUser?.role==="admin";
  document.getElementById("settingsContent").style.display=isAdmin?"block":"none";
  document.getElementById("settingsDenied").style.display=isAdmin?"none":"block";
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function sb(s){const m={delivered:"b-delivered ✅ Delivered",processing:"b-processing ⚙️ Processing",pending:"b-pending ⏳ Pending",cancelled:"b-cancelled ❌ Cancelled",shipped:"b-shipped 🚚 Shipped"};const p=(m[s]||"").split(" ");return`<span class="badge ${p[0]}">${p.slice(1).join(" ")}</span>`;}
function rb(r){return`<span class="badge ${"b-"+r}">${{admin:"👑 Admin",manager:"📊 Manager",viewer:"👁️ Viewer",customer:"🛒 Customer"}[r]||r}</span>`;}
function showToast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800);}
function showAdminToast(msg){const t=document.getElementById("adminToast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800);}
function subscribeNewsletter(){const e=document.getElementById("emailInput").value;if(!e||!e.includes("@")){showToast("⚠️ Enter a valid email");return;}showToast("🎉 Welcome to Palm Legacy family!");document.getElementById("emailInput").value="";}

// Input formatting
document.addEventListener("input",function(e){
  if(e.target.id==="cardNum"){let v=e.target.value.replace(/\D/g,"").substring(0,16);e.target.value=v.replace(/(.{4})/g,"$1 ").trim();}
  if(e.target.id==="expiry"){let v=e.target.value.replace(/\D/g,"").substring(0,4);if(v.length>2)v=v.substring(0,2)+"/"+v.substring(2);e.target.value=v;}
  if(e.target.id==="pin")e.target.value=e.target.value.replace(/\D/g,"").substring(0,6);
  if(e.target.classList.contains("otp-input"))e.target.value=e.target.value.replace(/\D/g,"");
});
document.addEventListener("keydown",function(e){
  if(e.key==="Backspace"&&e.target.classList.contains("otp-input")){
    const ids=["otp1","otp2","otp3","otp4","otp5","otp6"];
    const idx=ids.indexOf(e.target.id);
    if(idx>0&&!e.target.value){ document.getElementById(ids[idx-1]).focus(); }
  }
});

// Close modals on overlay click
// Safe modal overlay close listeners
[
  ["paymentModal", closePayment],
  ["successModal", closeSuccess],
  ["prodModal",    closeProdModal],
  ["policyModal",  closePolicyModal],
  ["catModal",     closeCatModal],
  ["uomModal",     closeUomModal],
  ["usrModal",     closeUsrModal],
  ["txnModal",     closeTxnModal],
].forEach(([id, fn]) => {
  const el = document.getElementById(id);
  if(el) el.addEventListener("click", function(e){ if(e.target === this) fn(); });
});

// INIT
renderProducts();
updateNavAuth();