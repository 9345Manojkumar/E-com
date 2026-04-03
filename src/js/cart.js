/* Palm Legacy – Cart & Checkout */

function removePromo(){
  _appliedPromo = null;
  doOpenPayment();
}

// ── Calculate promo discount on cart ──
function addToCart(id){
  const p=PRODUCTS.find(x=>x.id===id);
  if(!p){showToast("⚠️ Product not found");return;}
  if(!cart[id]) cart[id]={...p, qty:0};
  cart[id].qty++;
  updateCartUI();
  showToast("✓ "+p.name+" added!");
}
function removeFromCart(id){delete cart[id];updateCartUI();}
function changeQty(id,d){if(!cart[id])return;cart[id].qty+=d;if(cart[id].qty<=0)delete cart[id];updateCartUI();}
function updateCartUI(){
  const items=Object.values(cart);
  const qty=items.reduce((s,i)=>s+i.qty,0);
  const total=items.reduce((s,i)=>s+i.qty*i.price,0);
  document.getElementById("cartCount").textContent=qty;
  const ci=document.getElementById("cartItems"),cf=document.getElementById("cartFooter");
  if(!items.length){
    ci.innerHTML=`<div class="cart-empty"><div class="ei">🛒</div><p style="font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--text-mid)">Your cart is empty.<br>Add some pure jaggery!</p></div>`;
    cf.style.display="none";
  } else {
    cf.style.display="block";
    ci.innerHTML=items.map(i=>{
      const cat=getCAT(i.catId);
      const weight=prodWeight(i);
      // Show first image or category emoji
      const thumb=i.images&&i.images.length
        ?`<img src="${i.images[0].src}" style="width:100%;height:100%;object-fit:cover;border-radius:7px"/>`
        :`<span style="font-size:24px">${cat.icon}</span>`;
      return`<div class="cart-item">
        <div class="cart-item-img" style="background:${cat.bg}">${thumb}</div>
        <div style="flex:1">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-weight">📦 ${weight}</div>
          <div class="cart-item-price">₹${i.price*i.qty}</div>
          <div class="cart-qty">
            <button class="qty-btn" onclick="changeQty(${i.id},-1)">−</button>
            <span class="qty-num">${i.qty}</span>
            <button class="qty-btn" onclick="changeQty(${i.id},1)">+</button>
          </div>
        </div>
        <button class="cart-remove" onclick="removeFromCart(${i.id})">🗑</button>
      </div>`;
    }).join("");
    document.getElementById("cartTotal").textContent="₹"+total;
    const sn=document.getElementById("shippingNote");
    if(total>=499){sn.style.color="var(--green-mid)";sn.textContent="🎉 Free Delivery!";}
    else{sn.style.color="var(--text-mid)";sn.textContent="🚚 Add ₹"+(499-total)+" more for Free Delivery!";}
  }
}
function toggleCart(){document.getElementById("cartSidebar").classList.toggle("open");document.getElementById("cartOverlay").classList.toggle("open");}

// ═══════════════════════════════════════════════════
// CHECKOUT FLOW
// ═══════════════════════════════════════════════════
function openPayment(){
  if(!Object.values(cart).length){showToast("⚠️ Cart is empty!");return;}
  if(!currentUser){toggleCart();goToAuth(true);return;}
  toggleCart();doOpenPayment();
}
function doOpenPayment(){
  const items=Object.values(cart);
  // Apply effective offer prices per item
  const itemRows = items.map(i=>{
    const eff = getEffectivePrice(i);
    const unitPrice = eff.discount > 0 ? eff.price : i.price;
    const lineTotal = unitPrice * i.qty;
    return {...i, unitPrice, lineTotal, offerSaving: eff.discount * i.qty, policyName: eff.policyName};
  });
  const sub = itemRows.reduce((s,i)=>s+i.lineTotal, 0);
  const offerDiscount = itemRows.reduce((s,i)=>s+i.offerSaving, 0);
  const promoDiscount = calcPromoDiscount(items, sub);
  const delivery = (sub - promoDiscount) < 499 ? 49 : 0;
  const codCharge = selPay==="cod" ? 30 : 0;
  const grand = sub - promoDiscount + delivery + codCharge;
  // Build summary HTML
  let summaryHtml = itemRows.map(i=>`
    <div class="sum-item">
      <span>${i.name} × ${i.qty}${i.policyName?` <span style="font-size:9px;color:var(--green-dark)">🔥${i.policyName}</span>`:""}</span>
      <span>₹${i.lineTotal}${i.offerSaving>0?` <span style="font-size:9px;color:var(--green-dark);text-decoration:line-through">₹${i.price*i.qty}</span>`:""}</span>
    </div>`).join("");
  if(offerDiscount>0) summaryHtml+=`<div class="discount-row"><span>🔥 Offer Discount</span><span>-₹${offerDiscount}</span></div>`;
  if(promoDiscount>0) summaryHtml+=`<div class="discount-row"><span>🎟️ ${_appliedPromo.code}</span><span>-₹${promoDiscount}</span></div>`;
  summaryHtml+=`<div class="sum-item" style="color:${delivery?"inherit":"var(--green-mid)"}"><span>Delivery</span><span>${delivery?"₹"+delivery:"FREE 🎉"}</span></div>`;
  if(codCharge>0) summaryHtml+=`<div class="sum-item"><span>COD Handling Fee</span><span>₹${codCharge}</span></div>`;
  document.getElementById("modalSummaryItems").innerHTML=summaryHtml;
  document.getElementById("modalTotal").textContent="₹"+grand;
  // Show/hide promo section
  const promoSection=document.getElementById("promoSection");
  if(promoSection){
    if(_appliedPromo){
      promoSection.innerHTML=`<div class="promo-applied">🎟️ <strong>${_appliedPromo.code}</strong> applied — saving ₹${promoDiscount} <a onclick="removePromo()">✕ Remove</a></div>`;
    } else {
      promoSection.innerHTML=`<div class="promo-row"><input type="text" id="promoInput" placeholder="Enter promo code" oninput="this.value=this.value.toUpperCase()" onkeydown="if(event.key==='Enter')applyPromoFromInput()"/><button onclick="applyPromoFromInput()">Apply</button></div>`;
    }
  }
  document.getElementById("paymentModal").classList.add("open");
}

function applyPromoFromInput(){
  const code=document.getElementById("promoInput")?.value?.trim();
  if(!code){showToast("⚠️ Enter a promo code");return;}
  if(applyPromoCode(code)) doOpenPayment();
}
function closePayment(){document.getElementById("paymentModal").classList.remove("open");}
function selectPay(el,type){
  document.querySelectorAll(".pay-method").forEach(m=>m.classList.remove("active"));
  el.classList.add("active");selPay=type;
  document.getElementById("upiSec").style.display=type==="upi"?"block":"none";
  document.getElementById("cardSec").style.display=type==="card"?"block":"none";
  document.getElementById("codSec").style.display=type==="cod"?"block":"none";
}
function processPayment(){
  if(!document.getElementById("fname").value.trim()){showToast("⚠️ Enter your name");return;}
  if(document.getElementById("mobile").value.replace(/\D/g,"").length<10){showToast("⚠️ Enter valid mobile");return;}
  if(!document.getElementById("address").value.trim()){showToast("⚠️ Enter delivery address");return;}
  if(document.getElementById("pin").value.length!==6){showToast("⚠️ Enter 6-digit PIN");return;}
  if(selPay==="upi"&&!document.getElementById("upiId").value.trim()){showToast("⚠️ Enter UPI ID");return;}
  if(selPay==="card"&&document.getElementById("cardNum").value.replace(/\s/g,"").length<16){showToast("⚠️ Enter valid card number");return;}
  const btn=document.getElementById("payBtn");btn.textContent="⏳ Processing…";btn.disabled=true;
  if(USE_API){
    const items=Object.values(cart);
    const sub=items.reduce((s,i)=>s+i.price*i.qty,0);
    const promoDiscount=calcPromoDiscount(items,sub);
    const delivery=sub<499?49:0;
    const codCharge=selPay==="cod"?30:0;
    const payload={
      customer_name:  document.getElementById("fname").value.trim(),
      customer_mobile:document.getElementById("mobile").value.trim(),
      customer_email: currentUser?.email||"",
      delivery_address:document.getElementById("address").value.trim(),
      city:   document.getElementById("city")?.value.trim()||"",
      state:  document.getElementById("state")?.value.trim()||"",
      pincode:document.getElementById("pin").value.trim(),
      payment_method: selPay,
      subtotal: sub,
      offer_discount: items.reduce((s,i)=>{const e=getEffectivePrice(i);return s+(e.discount>0?e.discount*i.qty:0);},0),
      promo_discount: promoDiscount,
      promo_code: _appliedPromo?.code||null,
      delivery_charge: delivery,
      cod_charge: codCharge,
      grand_total: sub - promoDiscount + delivery + codCharge,
      items: items.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price,mrp:i.mrp,qty_value:i.qty,uom:getUOM(i.uomId).short}))
    };
    apiPlaceOrder(payload)
      .then(res=>{
        closePayment();
        document.getElementById("orderIdBadge").textContent="Order ID: "+res.order_number;
        document.getElementById("successModal").classList.add("open");
        cart={};_appliedPromo=null;updateCartUI();
        btn.textContent="🔒 Pay Now & Place Order";btn.disabled=false;
      })
      .catch(err=>{
        showToast("⚠️ Order failed: "+err.message);
        btn.textContent="🔒 Pay Now & Place Order";btn.disabled=false;
      });
    return;
  }
}
function closeSuccess(){document.getElementById("successModal").classList.remove("open");}

// ═══════════════════════════════════════════════════
// ADMIN SCREEN
// ═══════════════════════════════════════════════════