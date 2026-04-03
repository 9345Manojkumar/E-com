/* Palm Legacy – Product Master CRUD */

// ─────────────────────────────────────
// BUILD PRODUCTS
// ─────────────────────────────────────
function buildProds(){
  const role = currentUser?.role || "customer";
  const canView = ["admin","manager"].includes(role);

  document.getElementById("prodsContent").style.display = canView ? "block" : "none";
  document.getElementById("prodsDenied").style.display = canView ? "none" : "block";

  if(!canView) return;

  const canEdit = ["admin","manager"].includes(role);

  const btn = document.getElementById("addProdBtn");
  if(btn) btn.style.display = canEdit ? "inline-block" : "none";

  const catFilter = document.getElementById("prodCatFilter");
  if(catFilter){
    catFilter.innerHTML = `<div class="fb active" onclick="filterProds('all',this)">All</div>`;
  }
}

// ─────────────────────────────────────
// FILTER
// ─────────────────────────────────────
function filterProds(catId, el){
  document.querySelectorAll("#prodCatFilter .fb").forEach(b=>b.classList.remove("active"));
  if(el) el.classList.add("active");
  renderProdGrid(catId);
}

// ─────────────────────────────────────
// GRID
// ─────────────────────────────────────
function renderProdGrid(catId){
  const canEdit = ["admin","manager"].includes(currentUser?.role);
  const list = catId==="all" ? PRODUCTS : PRODUCTS.filter(p=>p.catId===catId);

  const el = document.getElementById("prodGridA");
  if(!el) return;

  el.innerHTML = list.map(p=>{
    const pct=Math.min(100,(p.stock/200)*100);
    const cls=p.stock<15?"stk-low":p.stock<40?"stk-med":"";
    const cat=getCAT(p.catId);
    const uom=getUOM(p.uomId);
    const active=p.active!==false;

    return `<div class="pca">
      <div class="pca-info">
        <div class="pca-name">${p.name}</div>
        <div>₹${p.price}</div>
        <div>${p.qty} ${uom.short}</div>
        <div class="stk-bar"><div class="stk-fill ${cls}" style="width:${pct}%"></div></div>

        ${canEdit ? `
          <button onclick="openProdModal(${p.id})">Edit</button>
          <button onclick="deleteProd(${p.id})">Delete</button>
        ` : ``}
      </div>
    </div>`;
  }).join("") || `<div>No products</div>`;
}

// ─────────────────────────────────────
// MODAL
// ─────────────────────────────────────
function openProdModal(id){
  const p = id ? PRODUCTS.find(x=>x.id===id) : null;

  document.getElementById("pmTitle").textContent = p ? "Edit Product" : "Add Product";
  document.getElementById("pm_id").value = p ? p.id : "";
  document.getElementById("pm_name").value = p ? p.name : "";
}

// ─────────────────────────────────────
// SAVE
// ─────────────────────────────────────
function saveProd(){
  const name = document.getElementById("pm_name").value.trim();
  const price = parseFloat(document.getElementById("pm_price").value);

  if(!name){
    showAdminToast("⚠️ Product name required");
    return;
  }

  const editId = parseInt(document.getElementById("pm_id").value);

  if(editId){
    const idx = PRODUCTS.findIndex(p=>p.id===editId);
    if(idx>=0){
      PRODUCTS[idx].name = name;
      PRODUCTS[idx].price = price;
    }
    showAdminToast("Updated");
  } else {
    PRODUCTS.push({
      id: nextProdId(),
      name,
      price
    });
    showAdminToast("Added");
  }

  buildProds();
}

// ─────────────────────────────────────
// DELETE
// ─────────────────────────────────────
function deleteProd(id){
  if(!confirm("Delete product?")) return;

  const idx = PRODUCTS.findIndex(p=>p.id===id);
  if(idx>=0){
    PRODUCTS.splice(idx,1);
    buildProds();
  }
}

// ─────────────────────────────────────
// CATEGORY (FIXED STRUCTURE)
// ─────────────────────────────────────
function openCatModal(id){
  console.log("open category", id);
}

function saveCat(){
  console.log("save category");
}

function deleteCat(id){
  const used = PRODUCTS.some(p=>p.catId===id);
  if(used){
    showAdminToast("Cannot delete");
    return;
  }
}

// ─────────────────────────────────────
// UOM (FIXED STRUCTURE)
// ─────────────────────────────────────
function openUomModal(id){
  console.log("open uom", id);
}

function saveUom(){
  console.log("save uom");
}

function deleteUom(id){
  const used = PRODUCTS.some(p=>p.uomId===id);
  if(used){
    showAdminToast("Cannot delete");
    return;
  }
}

// ─────────────────────────────────────
// TAB SWITCH
// ─────────────────────────────────────
function showProdTab(tab){
  ["products","cat","uom"].forEach(t=>{
    const el=document.getElementById("prodTab-"+t);
    if(el) el.style.display = t===tab ? "block":"none";
  });
}