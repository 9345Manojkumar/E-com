/* Palm Legacy – Shop / Product Display */

function renderProducts(){
  const active = PRODUCTS.filter(p=>p.active!==false);
  document.getElementById("productsGrid").innerHTML=active.map(p=>{
    const effPrice = getEffectivePrice(p);
    const displayPrice = effPrice.discount > 0 ? effPrice.price : p.price;
    const save = Math.round((1 - displayPrice/p.mrp)*100);
    const cat=getCAT(p.catId);
    const imgs = p.images && p.images.length ? p.images : null;
    const cid = "car_"+p.id;
    let imgHtml;
    if(imgs){
      imgHtml=`<div class="prod-carousel" id="${cid}">
        <div class="prod-carousel-inner" id="${cid}_inner">
          ${imgs.map(img=>`<div class="prod-carousel-slide"><img src="${img.src}" alt="${p.name}"/></div>`).join("")}
        </div>
        ${imgs.length>1?`
        <button class="prod-carousel-prev" onclick="event.stopPropagation();carouselSlide('${cid}',-1)">‹</button>
        <button class="prod-carousel-next" onclick="event.stopPropagation();carouselSlide('${cid}',1)">›</button>
        <div class="prod-carousel-dots" id="${cid}_dots">
          ${imgs.map((_,i)=>`<div class="prod-dot ${i===0?'active':''}" onclick="event.stopPropagation();carouselGo('${cid}',${i})"></div>`).join("")}
        </div>`:""}
      </div>`;
    } else {
      imgHtml=`<div class="prod-carousel-slide emoji-slide">${cat.icon}</div>`;
    }
    return`<div class="product-card">
      <div class="product-img" style="background:${cat.bg}">
        ${imgHtml}
        <div class="product-badge ${p.bc}">${p.badge}</div>
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.desc}</div>
        <div class="product-meta"><div class="product-weight">📦 ${prodWeight(p)}</div><div class="product-rating">★ ${p.rating} <span style="color:#aaa">(${p.reviews})</span></div></div>
        <div class="product-price">
          <span class="price-current">₹${displayPrice}</span>
          <span class="price-old">₹${p.mrp}</span>
          <span class="price-save">${save}% off</span>
          ${effPrice.policyName?`<span style="font-size:9px;background:#E8F5E9;color:var(--green-dark);padding:2px 7px;border-radius:10px;font-weight:700">🔥 ${effPrice.policyName}</span>`:""}
        </div>
        <button class="btn-add" onclick="addToCart(${p.id})">Add to Cart +</button>
      </div></div>`;
  }).join("");
}

// ── CAROUSEL LOGIC ──
const _carIdx = {};
function carouselSlide(id, dir){
  const inner = document.getElementById(id+"_inner");
  if(!inner) return;
  const slides = inner.children.length;
  _carIdx[id] = ((_carIdx[id]||0) + dir + slides) % slides;
  _applyCarousel(id, slides);
}
function carouselGo(id, idx){
  const inner = document.getElementById(id+"_inner");
  if(!inner) return;
  _carIdx[id] = idx;
  _applyCarousel(id, inner.children.length);
}
function _applyCarousel(id, slides){
  const idx = _carIdx[id]||0;
  const inner = document.getElementById(id+"_inner");
  if(inner) inner.style.transform = `translateX(-${idx*100}%)`;
  const dots = document.getElementById(id+"_dots");
  if(dots) Array.from(dots.children).forEach((d,i)=>d.classList.toggle("active",i===idx));
}

// ═══════════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════════