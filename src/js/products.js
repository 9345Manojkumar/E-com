/* Palm Legacy – Product Master CRUD */

function buildProds(){
  const role=currentUser?.role||"customer";
  const canView=["admin","manager"].includes(role);
  document.getElementById("prodsContent").style.display=canView?"block":"none";
  document.getElementById("prodsDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const canEdit=["admin","manager"].includes(role);
  if(document.getElementById("addProdBtn"))document.getElementById("addProdBtn").style.display=canEdit?"inline-block":"none";

  // Render filter tabs by category
  const catFilter=document.getElementById("prodCatFilter");
  if(catFilter){
    catFilter.innerHTML=`<div class="fb active" onclick="filterProds('all',this)">All</div>`
function filterProds(catId,el){
  document.querySelectorAll("#prodCatFilter .fb").forEach(b=>b.classList.remove("active"));
  if(el)el.classList.add("active");
  renderProdGrid(catId);
}

function renderProdGrid(catId){
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const list = catId==="all"?PRODUCTS:PRODUCTS.filter(p=>p.catId===catId);
  document.getElementById("prodGridA").innerHTML=list.map(p=>{
    const pct=Math.min(100,(p.stock/200)*100);
    const cls=p.stock<15?"stk-low":p.stock<40?"stk-med":"";
    const cat=getCAT(p.catId);
    const uom=getUOM(p.uomId);
    const active=p.active!==false;
    const firstImg = p.images && p.images.length ? p.images[0].src : null;
    return`<div class="pca" style="opacity:${active?1:0.5}">
      <div class="pca-img" style="background:${cat.bg}">
        ${firstImg
          ? `<img src="${firstImg}" alt="${p.name}"/>`
          : `<span>${cat.icon}</span>`}
        ${p.images && p.images.length>1 ? `<div class="pca-img-count">📷 ${p.images.length}</div>` : ""}
      </div>
      <div class="pca-info">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3px">
          <div class="pca-name">${p.name}</div>
          <span style="font-size:9px;background:${active?"var(--green-light)":"var(--red-light)"};color:${active?"var(--green-dark)":"var(--red)"};padding:2px 6px;border-radius:10px;font-weight:700">${active?"Active":"Inactive"}</span>
        </div>
        <div style="font-size:10px;color:var(--text-light);margin-bottom:4px">📁 ${cat.name}</div>
        <div class="pca-price">₹${p.price} <span style="font-size:10px;color:#aaa;text-decoration:line-through;font-weight:400">₹${p.mrp}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-light);margin-bottom:4px">
          <span>📦 ${p.qty} ${uom.short} (${uom.name})</span><span>Sold: ${p.sold}</span>
        </div>
        <div class="stk-bar"><div class="stk-fill ${cls}" style="width:${pct}%"></div></div>
        <div style="font-size:10px;font-weight:700;color:${p.stock<15?"var(--red)":p.stock<40?"var(--orange)":"var(--green-mid)"};margin-bottom:9px">
          ${p.stock<15?"⚠️ Low":"✅"} ${p.stock} units
        </div>
        ${canEdit?`<div style="display:flex;gap:5px">
          <button class="abtn abtn-o abtn-sm" style="flex:1" onclick="openProdModal(${p.id})">✏️ Edit</button>
          <button class="abtn abtn-sm" style="background:${active?"var(--red-light)":"var(--green-light)"};color:${active?"var(--red)":"var(--green-dark)"};border:1px solid ${active?"#ffcdd2":"#c8e6c9"}" onclick="toggleProdActive(${p.id})">${active?"Disable":"Enable"}</button>
          <button class="abtn abtn-d abtn-sm" onclick="deleteProd(${p.id})">🗑</button>
        </div>`:`<div style="font-size:10px;color:var(--text-light)">👁 View only</div>`}
      </div></div>`;
  }).join("")||`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light)">No products in this category yet.</div>`;
}

// ── PRODUCT MODAL ──
function openProdModal(id){
  const p=id?PRODUCTS.find(x=>x.id===id):null;
  document.getElementById("pmTitle").textContent=p?"Edit Product":"Add Product";
  document.getElementById("pm_id").value=p?p.id:"";
  document.getElementById("pm_name").value=p?p.name:"";
  document.getElementById("pm_desc").value=p?p.desc:"";
  document.getElementById("pm_price").value=p?p.price:"";
  document.getElementById("pm_mrp").value=p?p.mrp:"";
  document.getElementById("pm_qty").value=p?p.qty:"";
  document.getElementById("pm_stk").value=p?p.stock:"";
  document.getElementById("pm_badge").value=p?p.badge:"";
  document.getElementById("pm_active").checked=p?(p.active!==false):true;
  // Populate UOM dropdown
  const uomSel=document.getElementById("pm_uom");
function saveProd(){
  const name=document.getElementById("pm_name").value.trim();
  const price=parseFloat(document.getElementById("pm_price").value);
  const mrp=parseFloat(document.getElementById("pm_mrp").value);
  const qty=parseFloat(document.getElementById("pm_qty").value);
  const stock=parseInt(document.getElementById("pm_stk").value)||0;
  const uomId=parseInt(document.getElementById("pm_uom").value);
  const catId=parseInt(document.getElementById("pm_cat").value);
  const badge=document.getElementById("pm_badge").value.trim();
  const active=document.getElementById("pm_active").checked;
  const desc=document.getElementById("pm_desc").value.trim();
  if(!name){showAdminToast("⚠️ Product name required");return;}
  if(!price||!mrp){showAdminToast("⚠️ Price and MRP required");return;}
  if(!qty){showAdminToast("⚠️ Quantity required");return;}
  const images = getCurrentImgs();
  const editId=parseInt(document.getElementById("pm_id").value);
  if(editId){
    const idx=PRODUCTS.findIndex(p=>p.id===editId);
    if(idx>=0){PRODUCTS[idx]={...PRODUCTS[idx],name,desc,price,mrp,qty,uomId,catId,badge,bc:badge.toLowerCase()==="bestseller"?"bestseller":"",stock,active,images};}
    showAdminToast("✅ Product updated!");
  } else {
    PRODUCTS.push({id:nextProdId(),name,desc,price,mrp,qty,uomId,catId,badge,bc:badge.toLowerCase()==="bestseller"?"bestseller":"",stock,sold:0,rating:5.0,reviews:0,active,images});
    showAdminToast("✅ New product added!");
  }
  closeProdModal();
  buildProds();
  renderProducts();
}

// ══════════════════════════════════════
// IMAGE HANDLING — Multi-image upload
// ══════════════════════════════════════
function toggleProdActive(id){
  const p=PRODUCTS.find(x=>x.id===id);
  if(p){p.active=!p.active;buildProds();renderProducts();showAdminToast(p.active?"✅ Product enabled":"⚠️ Product disabled");}
}
function deleteProd(id){
  if(!confirm("Delete this product permanently?"))return;
  const idx=PRODUCTS.findIndex(p=>p.id===id);
  if(idx>=0){PRODUCTS.splice(idx,1);buildProds();renderProducts();showAdminToast("🗑 Product deleted");}
}

// ── CATEGORY MODAL ──
function openCatModal(id){
function saveCat(){
  const name=document.getElementById("cm_name").value.trim();
  const icon=document.getElementById("cm_icon").value.trim()||"📦";
  const bg=document.getElementById("cm_bg").value||"#FFF8E8";
  if(!name){showAdminToast("⚠️ Category name required");return;}
  const editId=parseInt(document.getElementById("cm_id").value);
  if(editId){
function deleteCat(id){
  const used=PRODUCTS.some(p=>p.catId===id);
  if(used){showAdminToast("⚠️ Cannot delete — products exist in this category");return;}
function openUomModal(id){
function saveUom(){
  const name=document.getElementById("um2_name").value.trim();
  const short=document.getElementById("um2_short").value.trim();
  if(!name||!short){showAdminToast("⚠️ Name and short code required");return;}
  const editId=parseInt(document.getElementById("um2_id").value);
  if(editId){
function deleteUom(id){
  const used=PRODUCTS.some(p=>p.uomId===id);
  if(used){showAdminToast("⚠️ Cannot delete — products use this UOM");return;}
function showProdTab(tab){
  ["products","cat","uom"].forEach(t=>{
    const el=document.getElementById("prodTab-"+t);
    if(el) el.style.display=t===tab?"block":"none";
  });
  if(tab==="cat") renderCatMasterTable();
  if(tab==="uom") renderUomMasterTable();
}

function renderCatMasterTable(){
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const el=document.getElementById("catMasterTable");
  if(!el)return;
  el.innerHTML=`<thead><tr><th>#</th><th>Icon</th><th>Category Name</th><th>Background</th><th>Products</th>${canEdit?"<th>Actions</th>":""}</tr></thead>
function renderUomMasterTable(){
  const canEdit=["admin","manager"].includes(currentUser?.role);
  const el=document.getElementById("uomMasterTable");
  if(!el)return;
  el.innerHTML=`<thead><tr><th>#</th><th>UOM Name</th><th>Short Code</th><th>Products Using</th>${canEdit?"<th>Actions</th>":""}</tr></thead>