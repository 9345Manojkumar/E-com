/* Palm Legacy – Pricing Policy */

function getEffectivePrice(product){
  const today = new Date().toISOString().split("T")[0];
  // Find active open offers matching this product
  const applicable = POLICIES.filter(pol=>{
    if(!pol.active) return false;
    if(pol.type !== "offer") return false;
    if(pol.from && today < pol.from) return false;
    if(pol.to   && today > pol.to)   return false;
    if(pol.scope === "all") return true;
    if(pol.scope === "category" && pol.scopeId === product.catId) return true;
    if(pol.scope === "product"  && pol.scopeId === product.id)    return true;
    return false;
  });
  if(!applicable.length) return {price: product.price, discount: 0, policyName: null};
  // Use best offer for customer
  let best = null, bestSaving = 0;
  applicable.forEach(pol=>{
    let discountedPrice, saving;
    if(pol.dtype === "percent"){
      let disc = Math.round(product.mrp * pol.percent / 100);
      if(pol.cap) disc = Math.min(disc, pol.cap);
      discountedPrice = product.mrp - disc;
      saving = disc;
    } else {
      discountedPrice = pol.override;
      saving = product.mrp - pol.override;
    }
    if(saving > bestSaving){bestSaving = saving; best = {price: discountedPrice, discount: saving, policyName: pol.name};}
  });
  return best || {price: product.price, discount: 0, policyName: null};
}

// ── Apply promo code ──
function applyPromoCode(code){
  const today = new Date().toISOString().split("T")[0];
  const pol = POLICIES.find(p=>p.code && p.code.toUpperCase()===code.toUpperCase() && p.active && p.type==="promo");
  if(!pol){ showToast("⚠️ Invalid or expired promo code"); return false; }
  if(pol.from && today < pol.from){ showToast("⚠️ Promo code not valid yet"); return false; }
  if(pol.to   && today > pol.to  ){ showToast("⚠️ Promo code has expired");   return false; }
  if(pol.totalUses && pol.usedCount >= pol.totalUses){ showToast("⚠️ Promo code usage limit reached"); return false; }
  _appliedPromo = pol;
  showToast("🎉 Promo code applied — " + pol.name);
  return true;
}

function calcPromoDiscount(items, subtotal){
  if(!_appliedPromo) return 0;
  const pol = _appliedPromo;
  const today = new Date().toISOString().split("T")[0];
  if(!pol.active || (pol.to && today > pol.to)){ _appliedPromo = null; return 0; }
  // Check min order
  if(pol.scope === "min_order" && pol.minOrder && subtotal < pol.minOrder){
    showToast("⚠️ Add ₹"+(pol.minOrder-subtotal)+" more to use "+pol.code);
    return 0;
  }
  // Calc discount on applicable items
  let discBase = 0;
  items.forEach(item=>{
    let applies = false;
    if(pol.scope === "all") applies = true;
    else if(pol.scope === "category" && pol.scopeId === item.catId) applies = true;
    else if(pol.scope === "product"  && pol.scopeId === item.id)    applies = true;
    else if(pol.scope === "min_order") applies = true;
    if(applies) discBase += item.price * item.qty;
  });
  let disc = 0;
  if(pol.dtype === "percent") disc = Math.round(discBase * pol.percent / 100);
  else disc = pol.override ? (discBase - pol.override * items.reduce((s,i)=>s+i.qty,0)) : 0;
  if(pol.cap) disc = Math.min(disc, pol.cap);
  return Math.max(0, disc);
}

// ── PRICING ADMIN PAGES ──
function buildPricing(){
  const role=currentUser?.role||"customer";
  const canView=["admin","manager"].includes(role);
  document.getElementById("pricingContent").style.display=canView?"block":"none";
  document.getElementById("pricingDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const canEdit=canView;
  if(document.getElementById("addPolicyBtn"))document.getElementById("addPolicyBtn").style.display=canEdit?"inline-block":"none";
  showPricingTab("all");
}

function showPricingTab(tab){
  ["all","promo","offer"].forEach(t=>{
    const el=document.getElementById("pricingTab-"+t);
    if(el) el.style.display=t===tab?"block":"none";
  });
  if(tab==="all")   renderPoliciesGrid("all");
  if(tab==="promo") renderPromoTable();
  if(tab==="offer") renderOfferTable();
}

function filterPolicies(f,el){
  _policyFilter=f;
  document.querySelectorAll("#apage-pricing .filter-bar .fb").forEach(b=>b.classList.remove("active"));
  if(el)el.classList.add("active");
  renderPoliciesGrid(f);
}

function renderPoliciesGrid(f){
  const today=new Date().toISOString().split("T")[0];
  let list=POLICIES;
  if(f==="offer")    list=POLICIES.filter(p=>p.type==="offer");
  else if(f==="promo")   list=POLICIES.filter(p=>p.type==="promo");
  else if(f==="active")  list=POLICIES.filter(p=>p.active && p.to>=today);
  else if(f==="inactive")list=POLICIES.filter(p=>!p.active || p.to<today);
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const grid=document.getElementById("policiesGrid");
  if(!grid)return;
  grid.innerHTML=list.map(p=>{
    const expired = p.to < today;
    const status  = !p.active?"Inactive":expired?"Expired":"Active";
    const dotCls  = (!p.active||expired)?"dot-inactive":"dot-active";
    const typeLbl = p.type==="offer"?"🔥 Open Offer":"🎟️ Promo Code";
    const typeCls = p.type==="offer"?"pt-offer":"pt-promo";
    const discLbl = p.dtype==="percent" ? `${p.percent}% off MRP${p.cap?` (max ₹${p.cap})`:""}` : `Override ₹${p.override}`;
    const scopeLbl = p.scope==="all"?"All Products":p.scope==="category"?`Category: ${getCAT(p.scopeId).name}`:p.scope==="product"?`Product: ${PRODUCTS.find(x=>x.id===p.scopeId)?.name||"—"}`:p.scope==="min_order"?`Min order ₹${p.minOrder}`:"—";
    return`<div class="policy-card ${!p.active||expired?"inactive":""}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span class="policy-type-badge ${typeCls}">${typeLbl}</span>
        <span style="font-size:10px"><span class="policy-status-dot ${dotCls}"></span>${status}</span>
      </div>
      <div class="policy-name">${p.name}</div>
      ${p.code?`<div style="margin-bottom:4px"><code style="background:var(--blue-light);color:var(--blue);padding:2px 10px;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:2px">${p.code}</code></div>`:""}
      <div class="policy-discount">${discLbl}</div>
      <div class="policy-meta">
        📦 ${scopeLbl}<br>
        📅 ${p.from} → ${p.to}<br>
        ${p.totalUses?`🔢 Used: ${p.usedCount}/${p.totalUses}`:"🔢 Unlimited uses"}
        ${p.perUser?` · ${p.perUser}/user`:""}
      </div>
      ${canEdit?`<div class="policy-actions">
        <button class="abtn abtn-o abtn-sm" style="flex:1" onclick="openPolicyModal(null,${p.id})">✏️ Edit</button>
        <button class="abtn abtn-sm" style="background:${p.active?"var(--red-light)":"var(--green-light)"};color:${p.active?"var(--red)":"var(--green-dark)"};border:1px solid ${p.active?"#ffcdd2":"#c8e6c9"}" onclick="togglePolicy(${p.id})">${p.active?"Disable":"Enable"}</button>
        <button class="abtn abtn-d abtn-sm" onclick="deletePolicy(${p.id})">🗑</button>
      </div>`:""}
    </div>`;
  }).join("")||`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light)">No policies found.</div>`;
}

function renderPromoTable(){
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const today=new Date().toISOString().split("T")[0];
  const promos=POLICIES.filter(p=>p.type==="promo");
  document.getElementById("promoTable").innerHTML=`<thead><tr><th>Code</th><th>Name</th><th>Discount</th><th>Scope</th><th>Validity</th><th>Usage</th><th>Status</th>${canEdit?"<th>Actions</th>":""}</tr></thead>
  <tbody>${promos.map(p=>{
    const expired=p.to<today;
    const disc=p.dtype==="percent"?`${p.percent}% off${p.cap?` (max ₹${p.cap})`:""}`:` ₹${p.override} fixed`;
    return`<tr>
      <td><code style="background:var(--blue-light);color:var(--blue);padding:2px 9px;border-radius:5px;font-size:12px;font-weight:800;letter-spacing:1.5px">${p.code}</code></td>
      <td><div class="tn">${p.name}</div></td>
      <td><strong style="color:var(--green-dark)">${disc}</strong></td>
      <td style="font-size:11px;color:var(--text-light)">${p.scope==="all"?"All":p.scope==="category"?getCAT(p.scopeId).name:p.scope==="product"?(PRODUCTS.find(x=>x.id===p.scopeId)?.name||"—"):`Min ₹${p.minOrder}`}</td>
      <td style="font-size:11px;color:var(--text-light)">${p.from} → ${p.to}</td>
      <td style="font-size:11px">${p.usedCount}/${p.totalUses||"∞"}${p.perUser?` (${p.perUser}/user)`:""}</td>
      <td><span class="badge ${!p.active||expired?"b-cancelled":"b-delivered"}">${!p.active?"Inactive":expired?"Expired":"Active"}</span></td>
      ${canEdit?`<td style="display:flex;gap:5px"><button class="abtn abtn-o abtn-sm" onclick="openPolicyModal(null,${p.id})">✏️</button><button class="abtn abtn-d abtn-sm" onclick="deletePolicy(${p.id})">🗑</button></td>`:""}
    </tr>`;
  }).join("")}</tbody>`;
}

function renderOfferTable(){
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const today=new Date().toISOString().split("T")[0];
  const offers=POLICIES.filter(p=>p.type==="offer");
  document.getElementById("offerTable").innerHTML=`<thead><tr><th>Offer Name</th><th>Discount</th><th>Scope</th><th>Validity</th><th>Status</th>${canEdit?"<th>Actions</th>":""}</tr></thead>
  <tbody>${offers.map(p=>{
    const expired=p.to<today;
    const disc=p.dtype==="percent"?`${p.percent}% off MRP${p.cap?` (max ₹${p.cap})`:""}`:` Override ₹${p.override}`;
    return`<tr>
      <td><div class="tn">${p.name}</div></td>
      <td><strong style="color:var(--green-dark)">${disc}</strong></td>
      <td style="font-size:11px;color:var(--text-light)">${p.scope==="all"?"All Products":p.scope==="category"?getCAT(p.scopeId).name:p.scope==="product"?(PRODUCTS.find(x=>x.id===p.scopeId)?.name||"—"):`Min ₹${p.minOrder}`}</td>
      <td style="font-size:11px;color:var(--text-light)">${p.from} → ${p.to}</td>
      <td><span class="badge ${!p.active||expired?"b-cancelled":"b-delivered"}">${!p.active?"Inactive":expired?"Expired":"Active"}</span></td>
      ${canEdit?`<td style="display:flex;gap:5px"><button class="abtn abtn-o abtn-sm" onclick="openPolicyModal(null,${p.id})">✏️</button><button class="abtn abtn-d abtn-sm" onclick="deletePolicy(${p.id})">🗑</button></td>`:""}
    </tr>`;
  }).join("")}</tbody>`;
}

// ── POLICY MODAL ──
function selectPolicyType(t){
  document.getElementById("pmol_type").value=t;
  ["offer","promo"].forEach(x=>{
    const el=document.getElementById("ptype-"+x);
    el.style.border=x===t?"2px solid var(--gold)":"2px solid var(--border)";
    el.style.background=x===t?"var(--gold-pale)":"#fff";
  });
  document.getElementById("pmol_code_row").style.display=t==="promo"?"block":"none";
}
function selectDiscountType(t){
  document.getElementById("pmol_dtype").value=t;
  ["percent","override"].forEach(x=>{
    const el=document.getElementById("dtype-"+x);
    el.style.border=x===t?"2px solid var(--gold)":"2px solid var(--border)";
    el.style.background=x===t?"var(--gold-pale)":"#fff";
  });
  document.getElementById("percent_field").style.display=t==="percent"?"block":"none";
  document.getElementById("override_field").style.display=t==="override"?"block":"none";
  previewDiscount();
}
function onScopeChange(){
  const s=document.getElementById("pmol_scope").value;
  document.getElementById("scope_cat_row").style.display=s==="category"?"block":"none";
  document.getElementById("scope_prod_row").style.display=s==="product"?"block":"none";
  document.getElementById("scope_minorder_row").style.display=s==="min_order"?"block":"none";
}
function previewDiscount(){
  const dtype=document.getElementById("pmol_dtype").value;
  const pct=parseFloat(document.getElementById("pmol_percent").value)||0;
  const ovr=parseFloat(document.getElementById("pmol_override").value)||0;
  const cap=parseFloat(document.getElementById("pmol_cap").value)||0;
  const prev=document.getElementById("discountPreview");
  if(dtype==="percent"&&pct>0){
    const sampleMRP=220;
    let disc=Math.round(sampleMRP*pct/100);
    if(cap) disc=Math.min(disc,cap);
    prev.style.display="block";
    prev.innerHTML=`Preview on ₹${sampleMRP} MRP: <strong>₹${sampleMRP-disc}</strong> (saving ₹${disc})${cap?" · Max discount ₹"+cap:""}`;
  } else if(dtype==="override"&&ovr>0){
    prev.style.display="block";
    prev.innerHTML=`Customer pays: <strong>₹${ovr}</strong> (regardless of MRP)`;
  } else {prev.style.display="none";}
}

function openPolicyModal(defaultType, id){
  const p=id?POLICIES.find(x=>x.id===id):null;
  document.getElementById("pmolTitle").textContent=p?"Edit Policy":"Add Policy";
  document.getElementById("pmol_id").value=p?p.id:"";
  // Populate scope dropdowns
function savePolicy(){
  const name=document.getElementById("pmol_name").value.trim();
  const type=document.getElementById("pmol_type").value;
  const dtype=document.getElementById("pmol_dtype").value;
  const code=document.getElementById("pmol_code").value.trim().toUpperCase();
  const percent=parseFloat(document.getElementById("pmol_percent").value)||null;
  const override=parseFloat(document.getElementById("pmol_override").value)||null;
  const cap=parseFloat(document.getElementById("pmol_cap").value)||null;
  const scope=document.getElementById("pmol_scope").value;
  const from=document.getElementById("pmol_from").value;
  const to=document.getElementById("pmol_to").value;
  const totalUses=parseInt(document.getElementById("pmol_total_uses").value)||null;
  const perUser=parseInt(document.getElementById("pmol_per_user").value)||null;
  const active=document.getElementById("pmol_active").checked;
  if(!name){showAdminToast("⚠️ Policy name required");return;}
  if(type==="promo"&&!code){showAdminToast("⚠️ Promo code required");return;}
  if(dtype==="percent"&&!percent){showAdminToast("⚠️ Discount % required");return;}
  if(dtype==="override"&&!override){showAdminToast("⚠️ Override price required");return;}
  if(!from||!to){showAdminToast("⚠️ Validity dates required");return;}
  if(from>to){showAdminToast("⚠️ End date must be after start date");return;}
  // Check duplicate promo code
  const editId=parseInt(document.getElementById("pmol_id").value);
  if(type==="promo"){
    const dup=POLICIES.find(p=>p.code===code&&p.id!==editId);
    if(dup){showAdminToast("⚠️ Promo code already exists: "+code);return;}
  }
  const scopeId=scope==="category"?parseInt(document.getElementById("pmol_cat_scope").value):scope==="product"?parseInt(document.getElementById("pmol_prod_scope").value):null;
  const minOrder=scope==="min_order"?parseFloat(document.getElementById("pmol_minorder").value)||null:null;
  const policy={type,name,dtype,percent,override,cap,scope,scopeId,minOrder,code:type==="promo"?code:null,totalUses,perUser,from,to,active};
  if(editId){
    const idx=POLICIES.findIndex(p=>p.id===editId);
    if(idx>=0) POLICIES[idx]={...POLICIES[idx],...policy};
    showAdminToast("✅ Policy updated!");
  } else {
    POLICIES.push({id:nextPolicyId(),usedCount:0,...policy});
    showAdminToast("✅ Policy created!");
  }
  closePolicyModal();buildPricing();
}
function togglePolicy(id){const p=POLICIES.find(x=>x.id===id);if(p){p.active=!p.active;buildPricing();showAdminToast(p.active?"✅ Policy enabled":"⚠️ Policy disabled");}}
function deletePolicy(id){if(!confirm("Delete this policy?"))return;POLICIES=POLICIES.filter(p=>p.id!==id);buildPricing();showAdminToast("🗑 Policy deleted");}

// ═══════════════════════════════════════════════════
// SHOP — PRODUCTS
// ═══════════════════════════════════════════════════