/* Palm Legacy – AR / AP / Inventory */

function computeRunningBalance(txns){
  let bal=0;
  return txns.map(t=>{
    bal += (t.debit||0) - (t.credit||0);
    return {...t, runBal: bal};
  });
}

// ── STOCK POSITION ──
function getStockPosition(){
  const pos={};
  ITEM_TXN.forEach(t=>{
    if(!pos[t.productId]) pos[t.productId]={inQty:0,outQty:0,inVal:0,outVal:0};
    if(t.direction==="in"){  pos[t.productId].inQty+=t.qty;  pos[t.productId].inVal+=t.amount; }
    else{                    pos[t.productId].outQty+=t.qty; pos[t.productId].outVal+=t.amount; }
  });
  return pos;
}

// ── AR PAGE ──
function buildAR(){
  const canView=["admin","manager","viewer"].includes(currentUser?.role);
  document.getElementById("arContent").style.display=canView?"block":"none";
  document.getElementById("arDenied").style.display=canView?"none":"block";
  if(!canView)return;
  // Summary
  const totalDr=AR_TXN.reduce((s,t)=>s+(t.debit||0),0);
  const totalCr=AR_TXN.reduce((s,t)=>s+(t.credit||0),0);
  const outstanding=totalDr-totalCr;
  const overdue=AR_TXN.filter(t=>t.due&&t.due<new Date().toISOString().split("T")[0]&&t.status!=="paid").reduce((s,t)=>s+(t.debit||0),0);
  document.getElementById("arSummary").innerHTML=`
    <div class="sum-box ar-box"><div class="sum-box-label">Total Invoiced</div><div class="sum-box-val" style="color:var(--green-dark)">₹${totalDr.toLocaleString()}</div><div class="sum-box-sub">${AR_TXN.filter(t=>t.type==="sale").length} invoices</div></div>
    <div class="sum-box ar-box"><div class="sum-box-label">Total Received</div><div class="sum-box-val" style="color:var(--blue)">₹${totalCr.toLocaleString()}</div><div class="sum-box-sub">${AR_TXN.filter(t=>t.type==="receipt").length} receipts</div></div>
    <div class="sum-box ar-box"><div class="sum-box-label">Outstanding</div><div class="sum-box-val" style="color:${outstanding>0?"var(--orange)":"var(--green-mid)"}">₹${Math.abs(outstanding).toLocaleString()}</div><div class="sum-box-sub">${outstanding>0?"Receivable":"Overpaid"}</div></div>
    <div class="sum-box ar-box"><div class="sum-box-label">Overdue</div><div class="sum-box-val" style="color:var(--red)">₹${overdue.toLocaleString()}</div><div class="sum-box-sub">Past due date</div></div>`;
  // Set default date range
  const today=new Date().toISOString().split("T")[0];
  const from30=new Date(Date.now()-30*864e5).toISOString().split("T")[0];
  if(!document.getElementById("arFromDate").value) document.getElementById("arFromDate").value=from30;
  if(!document.getElementById("arToDate").value)   document.getElementById("arToDate").value=today;
  // Load AR transactions from DB
  const fromD=document.getElementById("arFromDate").value||from30;
  const toD=document.getElementById("arToDate").value||today;
  apiFetch('/ar?from='+fromD+'&to='+toD)
    .then(data=>{
      AR_TXN=data.map(t=>({
        id:t.id, date:t.txn_date?.substring(0,10)||t.date,
        type:t.txn_type||t.type, party:t.party_name||t.party,
        ref:t.ref_doc||t.ref, debit:parseFloat(t.debit_amt||t.debit||0),
        credit:parseFloat(t.credit_amt||t.credit||0), balance:0,
        paymode:t.payment_mode||t.paymode||"credit",
        due:t.due_date||t.due||null, status:t.status||"posted",
        notes:t.notes||""
      }));
      buildARLedger();
    })
    .catch(err=>{ console.error('AR load:',err.message); buildARLedger(); });
}

function buildARLedger(){
  const from=document.getElementById("arFromDate").value;
  const to=document.getElementById("arToDate").value;
  const filtered=AR_TXN.filter(t=>(!from||t.date>=from)&&(!to||t.date<=to));
  const rows=computeRunningBalance(filtered);
  const canEdit=["admin","manager"].includes(currentUser?.role);
  document.getElementById("arLedgerWrap").innerHTML=`
    <div class="ledger-row ledger-head">
      <div class="ledger-cell">Date</div><div class="ledger-cell">Party / Narration</div>
      <div class="ledger-cell">Type</div><div class="ledger-cell">Ref</div>
      <div class="ledger-cell">Debit (₹)</div><div class="ledger-cell">Credit (₹)</div><div class="ledger-cell">Balance</div>
    </div>`+
    rows.map(t=>`<div class="ledger-row">
      <div class="ledger-cell" style="font-size:11px;color:var(--text-light)">${t.date}</div>
      <div class="ledger-cell"><div class="tn">${t.party}</div><div class="ts">${t.notes||""}</div></div>
      <div class="ledger-cell"><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></div>
      <div class="ledger-cell" style="font-size:11px;color:var(--text-light)">${t.ref}</div>
      <div class="ledger-cell"><span class="dr">${t.debit?'₹'+t.debit.toLocaleString():''}</span></div>
      <div class="ledger-cell"><span class="cr">${t.credit?'₹'+t.credit.toLocaleString():''}</span></div>
      <div class="ledger-cell"><span class="${t.runBal>=0?'bal-pos':'bal-neg'}">₹${Math.abs(t.runBal).toLocaleString()}${t.runBal<0?" CR":""}</span></div>
    </div>`).join("")+
    `<div class="ledger-row" style="background:var(--bg-admin)">
      <div class="ledger-cell" style="grid-column:span 4;font-weight:800;font-size:12px">CLOSING BALANCE</div>
      <div class="ledger-cell dr">₹${rows.reduce((s,t)=>s+(t.debit||0),0).toLocaleString()}</div>
      <div class="ledger-cell cr">₹${rows.reduce((s,t)=>s+(t.credit||0),0).toLocaleString()}</div>
      <div class="ledger-cell"><span class="bal-pos" style="font-size:13px">₹${Math.abs(rows.reduce((s,t)=>s+(t.debit||0)-(t.credit||0),0)).toLocaleString()}</span></div>
    </div>`;
}

function showArTab(tab,el){
  ["ledger","customers","invoices","receipts"].forEach(t=>{ const e=document.getElementById("arTab-"+t); if(e) e.style.display=t===tab?"block":"none"; });
  document.querySelectorAll("#apage-ar .fin-tab").forEach(b=>b.classList.remove("active"));
  if(el) el.classList.add("active");
  if(tab==="customers") buildARCustomers();
  if(tab==="invoices")  buildARInvoices();
  if(tab==="receipts")  buildARReceipts();
}

function buildARCustomers(){
  // Group by party
  const parties={};
  AR_TXN.forEach(t=>{ if(!parties[t.party]) parties[t.party]={dr:0,cr:0,txns:0}; parties[t.party].dr+=(t.debit||0); parties[t.party].cr+=(t.credit||0); parties[t.party].txns++; });
  document.getElementById("arCustomerList").innerHTML=Object.entries(parties).map(([name,d])=>{
    const bal=d.dr-d.cr;
    return`<div class="party-card">
      <div class="party-avatar pa-ar">${name[0]}</div>
      <div class="party-info"><div class="party-name">${name}</div><div class="party-sub">${d.txns} transactions</div></div>
      <div class="party-balance"><div class="bal-label">Balance</div><div class="bal-amount ${bal>0?"bal-pos":"bal-neg"}">₹${Math.abs(bal).toLocaleString()}<span style="font-size:10px;font-weight:400"> ${bal>0?"DR":"CR"}</span></div></div>
    </div>`;
  }).join("")||"<div style='padding:30px;text-align:center;color:var(--text-light)'>No customer transactions yet.</div>";
}

function buildARInvoices(){
  const invs=AR_TXN.filter(t=>t.type==="sale"||t.type==="sale_return");
  document.getElementById("arInvoiceTable").innerHTML=`<thead><tr><th>Date</th><th>Customer</th><th>Ref / Invoice No.</th><th>Type</th><th>Amount</th><th>Status</th><th>Due Date</th></tr></thead><tbody>`+
    invs.map(t=>`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${t.party}</div></td><td style="font-size:11px;color:var(--blue)">${t.ref}</td><td><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td><td><strong class="${t.type==='sale_return'?'cr':'dr'}">₹${(t.debit||t.credit||0).toLocaleString()}</strong></td><td><span class="badge ${statusBadge(t.status)}">${t.status}</span></td><td style="font-size:11px;color:var(--text-light)">${t.due||"—"}</td></tr>`).join("")+`</tbody>`;
}

function buildARReceipts(){
  const recs=AR_TXN.filter(t=>t.type==="receipt");
  document.getElementById("arReceiptTable").innerHTML=`<thead><tr><th>Date</th><th>Customer</th><th>Ref</th><th>Mode</th><th>Amount Received</th><th>Status</th></tr></thead><tbody>`+
    recs.map(t=>`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${t.party}</div></td><td style="font-size:11px;color:var(--blue)">${t.ref}</td><td style="font-size:11px">${t.paymode}</td><td><strong class="cr">₹${(t.credit||0).toLocaleString()}</strong></td><td><span class="badge b-delivered">${t.status}</span></td></tr>`).join("")+`</tbody>`;
}

// ── AP PAGE ──
function buildAP(){
  const canView=["admin","manager","viewer"].includes(currentUser?.role);
  document.getElementById("apContent").style.display=canView?"block":"none";
  document.getElementById("apDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const totalCr=AP_TXN.reduce((s,t)=>s+(t.credit||0),0);
  const totalDr=AP_TXN.reduce((s,t)=>s+(t.debit||0),0);
  const outstanding=totalCr-totalDr;
  const overdue=AP_TXN.filter(t=>t.due&&t.due<new Date().toISOString().split("T")[0]&&t.status!=="paid").reduce((s,t)=>s+(t.credit||0),0);
  document.getElementById("apSummary").innerHTML=`
    <div class="sum-box ap-box"><div class="sum-box-label">Total Purchased</div><div class="sum-box-val" style="color:var(--orange)">₹${totalCr.toLocaleString()}</div><div class="sum-box-sub">${AP_TXN.filter(t=>t.type==="purchase").length} bills</div></div>
    <div class="sum-box ap-box"><div class="sum-box-label">Total Paid</div><div class="sum-box-val" style="color:var(--blue)">₹${totalDr.toLocaleString()}</div><div class="sum-box-sub">${AP_TXN.filter(t=>t.type==="payment").length} payments</div></div>
    <div class="sum-box ap-box"><div class="sum-box-label">Outstanding Payable</div><div class="sum-box-val" style="color:${outstanding>0?"var(--red)":"var(--green-mid)"}">₹${Math.abs(outstanding).toLocaleString()}</div><div class="sum-box-sub">${outstanding>0?"Payable":"Advance"}</div></div>
    <div class="sum-box ap-box"><div class="sum-box-label">Overdue</div><div class="sum-box-val" style="color:var(--red)">₹${overdue.toLocaleString()}</div><div class="sum-box-sub">Past due date</div></div>`;
  const today=new Date().toISOString().split("T")[0];
  const from30=new Date(Date.now()-30*864e5).toISOString().split("T")[0];
  if(!document.getElementById("apFromDate").value) document.getElementById("apFromDate").value=from30;
  if(!document.getElementById("apToDate").value)   document.getElementById("apToDate").value=today;
  const fromD=document.getElementById("apFromDate").value||from30;
  const toD=document.getElementById("apToDate").value||today;
  apiFetch('/ap?from='+fromD+'&to='+toD)
    .then(data=>{
      AP_TXN=data.map(t=>({
        id:t.id, date:t.txn_date?.substring(0,10)||t.date,
        type:t.txn_type||t.type, party:t.party_name||t.party,
        ref:t.ref_doc||t.ref, debit:parseFloat(t.debit_amt||t.debit||0),
        credit:parseFloat(t.credit_amt||t.credit||0), balance:0,
        paymode:t.payment_mode||t.paymode||"credit",
        due:t.due_date||t.due||null, status:t.status||"posted",
        notes:t.notes||""
      }));
      buildAPLedger();
    })
    .catch(err=>{ console.error('AP load:',err.message); buildAPLedger(); });
}

function buildAPLedger(){
  const from=document.getElementById("apFromDate").value;
  const to=document.getElementById("apToDate").value;
  const filtered=AP_TXN.filter(t=>(!from||t.date>=from)&&(!to||t.date<=to));
  const rows=computeRunningBalance(filtered.map(t=>({...t, debit:t.debit, credit:t.credit})));
  document.getElementById("apLedgerWrap").innerHTML=`
    <div class="ledger-row ledger-head">
      <div class="ledger-cell">Date</div><div class="ledger-cell">Party / Narration</div>
      <div class="ledger-cell">Type</div><div class="ledger-cell">Ref</div>
      <div class="ledger-cell">Debit (₹)</div><div class="ledger-cell">Credit (₹)</div><div class="ledger-cell">Balance</div>
    </div>`+
    rows.map(t=>`<div class="ledger-row">
      <div class="ledger-cell" style="font-size:11px;color:var(--text-light)">${t.date}</div>
      <div class="ledger-cell"><div class="tn">${t.party}</div><div class="ts">${t.notes||""}</div></div>
      <div class="ledger-cell"><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></div>
      <div class="ledger-cell" style="font-size:11px;color:var(--text-light)">${t.ref}</div>
      <div class="ledger-cell"><span class="dr">${t.debit?'₹'+t.debit.toLocaleString():''}</span></div>
      <div class="ledger-cell"><span class="cr">${t.credit?'₹'+t.credit.toLocaleString():''}</span></div>
      <div class="ledger-cell"><span class="${t.runBal<=0?'bal-pos':'bal-neg'}">₹${Math.abs(t.runBal).toLocaleString()}${t.runBal>0?" CR":""}</span></div>
    </div>`).join("")+
    `<div class="ledger-row" style="background:var(--bg-admin)">
      <div class="ledger-cell" style="grid-column:span 4;font-weight:800;font-size:12px">CLOSING BALANCE</div>
      <div class="ledger-cell dr">₹${rows.reduce((s,t)=>s+(t.debit||0),0).toLocaleString()}</div>
      <div class="ledger-cell cr">₹${rows.reduce((s,t)=>s+(t.credit||0),0).toLocaleString()}</div>
      <div class="ledger-cell"><span class="bal-neg" style="font-size:13px">₹${Math.abs(rows.reduce((s,t)=>s+(t.credit||0)-(t.debit||0),0)).toLocaleString()}</span></div>
    </div>`;
}

function showApTab(tab,el){
  ["ledger","suppliers","purchases","payments"].forEach(t=>{ const e=document.getElementById("apTab-"+t); if(e) e.style.display=t===tab?"block":"none"; });
  document.querySelectorAll("#apage-ap .fin-tab").forEach(b=>b.classList.remove("active"));
  if(el) el.classList.add("active");
  if(tab==="suppliers") buildAPSuppliers();
  if(tab==="purchases") buildAPPurchases();
  if(tab==="payments")  buildAPPayments();
}

function buildAPSuppliers(){
  const parties={};
  AP_TXN.forEach(t=>{ if(!parties[t.party]) parties[t.party]={dr:0,cr:0,txns:0}; parties[t.party].dr+=(t.debit||0); parties[t.party].cr+=(t.credit||0); parties[t.party].txns++; });
  document.getElementById("apSupplierList").innerHTML=Object.entries(parties).map(([name,d])=>{
    const bal=d.cr-d.dr;
    return`<div class="party-card">
      <div class="party-avatar pa-ap">${name[0]}</div>
      <div class="party-info"><div class="party-name">${name}</div><div class="party-sub">${d.txns} transactions</div></div>
      <div class="party-balance"><div class="bal-label">Payable</div><div class="bal-amount ${bal>0?"bal-neg":"bal-pos"}">₹${Math.abs(bal).toLocaleString()}<span style="font-size:10px;font-weight:400"> ${bal>0?"CR":"DR"}</span></div></div>
    </div>`;
  }).join("");
}

function buildAPPurchases(){
  const purs=AP_TXN.filter(t=>t.type==="purchase"||t.type==="purchase_return");
  document.getElementById("apPurchaseTable").innerHTML=`<thead><tr><th>Date</th><th>Supplier</th><th>Bill No.</th><th>Type</th><th>Amount</th><th>Status</th><th>Due Date</th></tr></thead><tbody>`+
    purs.map(t=>`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${t.party}</div></td><td style="font-size:11px;color:var(--blue)">${t.ref}</td><td><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td><td><strong class="cr">₹${(t.credit||0).toLocaleString()}</strong></td><td><span class="badge ${statusBadge(t.status)}">${t.status}</span></td><td style="font-size:11px;color:var(--text-light)">${t.due||"—"}</td></tr>`).join("")+`</tbody>`;
}

function buildAPPayments(){
  const pays=AP_TXN.filter(t=>t.type==="payment");
  document.getElementById("apPaymentTable").innerHTML=`<thead><tr><th>Date</th><th>Supplier</th><th>Ref</th><th>Mode</th><th>Amount Paid</th><th>Status</th></tr></thead><tbody>`+
    pays.map(t=>`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${t.party}</div></td><td style="font-size:11px;color:var(--blue)">${t.ref}</td><td style="font-size:11px">${t.paymode}</td><td><strong class="dr">₹${(t.debit||0).toLocaleString()}</strong></td><td><span class="badge b-delivered">${t.status}</span></td></tr>`).join("")+`</tbody>`;
}

// ── INVENTORY PAGE ──
function buildInventory(){
  const canView=["admin","manager","viewer"].includes(currentUser?.role);
  document.getElementById("inventoryContent").style.display=canView?"block":"none";
  document.getElementById("inventoryDenied").style.display=canView?"none":"block";
  if(!canView)return;
  const pos=getStockPosition();
  const totalIn=ITEM_TXN.filter(t=>t.direction==="in").reduce((s,t)=>s+t.amount,0);
  const totalOut=ITEM_TXN.filter(t=>t.direction==="out").reduce((s,t)=>s+t.amount,0);
  const totalStockVal=Object.entries(pos).reduce((s,[pid,d])=>{
    const p=PRODUCTS.find(x=>x.id===parseInt(pid)); return s+(p?(d.inQty-d.outQty)*(p.price||0):0);
  },0);
  document.getElementById("invSummary").innerHTML=`
    <div class="sum-box inv-box"><div class="sum-box-label">Total Inbound Value</div><div class="sum-box-val" style="color:var(--green-dark)">₹${totalIn.toLocaleString()}</div><div class="sum-box-sub">${ITEM_TXN.filter(t=>t.direction==="in").length} inbound txns</div></div>
    <div class="sum-box inv-box"><div class="sum-box-label">Total Outbound Value</div><div class="sum-box-val" style="color:var(--orange)">₹${totalOut.toLocaleString()}</div><div class="sum-box-sub">${ITEM_TXN.filter(t=>t.direction==="out").length} outbound txns</div></div>
    <div class="sum-box inv-box"><div class="sum-box-label">Current Stock Value</div><div class="sum-box-val" style="color:var(--brown-dark)">₹${totalStockVal.toLocaleString()}</div><div class="sum-box-sub">${PRODUCTS.length} products</div></div>
    <div class="sum-box inv-box"><div class="sum-box-label">Low Stock Items</div><div class="sum-box-val" style="color:var(--red)">${PRODUCTS.filter(p=>p.stock<15).length}</div><div class="sum-box-sub">Below reorder level</div></div>`;
  // Load item transactions from DB
  apiFetch('/inventory/transactions')
    .then(data=>{
      ITEM_TXN=data.map(t=>({
        id:t.id, date:t.txn_date?.substring(0,10)||t.date,
        txnId:t.txn_ref||t.txnId, type:t.txn_type||t.type,
        productId:t.product_id||t.productId, qty:parseFloat(t.qty||0),
        uomId:t.uom_id||t.uomId, direction:t.direction,
        rate:parseFloat(t.rate||0), amount:parseFloat(t.amount||0),
        party:t.party_name||t.party||"", ref:t.ref_doc||t.ref||"",
        notes:t.notes||""
      }));
      buildStockTable();
    })
    .catch(err=>{ console.error('Inventory load:',err.message); buildStockTable(); });
  // Populate item filter
  const sel=document.getElementById("invItemFilter");
  if(sel){ sel.innerHTML=`<option value="">All Products</option>`+PRODUCTS.map(p=>`<option value="${p.id}">${p.name}</option>`).join(""); }
}

function buildStockTable(){
  const pos=getStockPosition();
  document.getElementById("invStockTable").innerHTML=`
    <div class="inv-item" style="background:var(--bg-admin)">
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">PRODUCT</div>
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">IN</div>
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">OUT</div>
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">BALANCE</div>
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">STATUS</div>
      <div class="inv-cell" style="font-size:9px;font-weight:800;color:var(--text-light);letter-spacing:1px;text-transform:uppercase">STOCK VALUE</div>
    </div>`+
    PRODUCTS.map(p=>{
      const d=pos[p.id]||{inQty:0,outQty:0,inVal:0,outVal:0};
      const bal=d.inQty-d.outQty;
      const val=bal*p.price;
      const cls=bal<15?"stock-low":bal<40?"stock-mid":"stock-ok";
      const uom=getUOM(p.uomId);
      const cat=getCAT(p.catId);
      return`<div class="inv-item">
        <div class="inv-cell"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${cat.icon}</span><div><div class="tn">${p.name}</div><div class="ts">${p.qty}${uom.short} / unit</div></div></div></div>
        <div class="inv-cell"><span class="cr">+${d.inQty}</span><div class="ts">₹${d.inVal.toLocaleString()}</div></div>
        <div class="inv-cell"><span class="dr">-${d.outQty}</span><div class="ts">₹${d.outVal.toLocaleString()}</div></div>
        <div class="inv-cell"><strong style="font-size:15px">${bal}</strong> <span style="font-size:10px;color:var(--text-light)">${uom.short}</span></div>
        <div class="inv-cell"><span class="stock-pill ${cls}">${bal<15?"⚠️ Low":bal<40?"⚡ Mid":"✅ OK"}</span></div>
        <div class="inv-cell"><strong>₹${val.toLocaleString()}</strong></div>
      </div>`;
    }).join("");
}

function showInvTab(tab,el){
  ["stock","inbound","outbound","ledger"].forEach(t=>{ const e=document.getElementById("invTab-"+t); if(e) e.style.display=t===tab?"block":"none"; });
  document.querySelectorAll("#apage-inventory .fin-tab").forEach(b=>b.classList.remove("active"));
  if(el) el.classList.add("active");
  if(tab==="inbound")  buildInvInbound();
  if(tab==="outbound") buildInvOutbound();
  if(tab==="ledger")   buildItemLedger();
}

function buildInvInbound(){
  const txns=ITEM_TXN.filter(t=>t.direction==="in");
  document.getElementById("invInboundTable").innerHTML=`<thead><tr><th>Date</th><th>Product</th><th>Txn Ref</th><th>Type</th><th>Party</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>`+
    txns.map(t=>{ const p=PRODUCTS.find(x=>x.id===t.productId)||{}; const u=getUOM(t.uomId);
      return`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${p.name||"—"}</div></td><td style="font-size:11px;color:var(--blue)">${t.txnId}</td><td><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td><td style="font-size:11px">${t.party}</td><td><strong class="cr">+${t.qty} ${u.short}</strong></td><td style="font-size:11px">₹${t.rate||0}</td><td><strong>₹${t.amount.toLocaleString()}</strong></td></tr>`;
    }).join("")+`</tbody>`;
}

function buildInvOutbound(){
  const txns=ITEM_TXN.filter(t=>t.direction==="out");
  document.getElementById("invOutboundTable").innerHTML=`<thead><tr><th>Date</th><th>Product</th><th>Txn Ref</th><th>Type</th><th>Party</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>`+
    txns.map(t=>{ const p=PRODUCTS.find(x=>x.id===t.productId)||{}; const u=getUOM(t.uomId);
      return`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${p.name||"—"}</div></td><td style="font-size:11px;color:var(--blue)">${t.txnId}</td><td><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td><td style="font-size:11px">${t.party}</td><td><strong class="dr">-${t.qty} ${u.short}</strong></td><td style="font-size:11px">₹${t.rate||0}</td><td><strong>₹${t.amount.toLocaleString()}</strong></td></tr>`;
    }).join("")+`</tbody>`;
}

function buildItemLedger(){
  const filter=parseInt(document.getElementById("invItemFilter")?.value)||null;
  const txns=filter?ITEM_TXN.filter(t=>t.productId===filter):ITEM_TXN;
  document.getElementById("invLedgerTable").innerHTML=`<thead><tr><th>Date</th><th>Product</th><th>Ref</th><th>Type</th><th>Party</th><th>Inbound</th><th>Outbound</th><th>Running Bal</th></tr></thead><tbody>`+
    (()=>{ let bal=0; return txns.map(t=>{ const p=PRODUCTS.find(x=>x.id===t.productId)||{}; const u=getUOM(t.uomId);
      if(t.direction==="in") bal+=t.qty; else bal-=t.qty;
      return`<tr><td style="font-size:11px">${t.date}</td><td><div class="tn">${p.name||"—"}</div></td><td style="font-size:11px;color:var(--blue)">${t.ref}</td><td><span class="txn-type-badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td><td style="font-size:11px">${t.party}</td><td class="cr">${t.direction==="in"?"+"+t.qty+" "+u.short:""}</td><td class="dr">${t.direction==="out"?"-"+t.qty+" "+u.short:""}</td><td><strong>${bal} ${u.short}</strong></td></tr>`;
    }); })().join("")+`</tbody>`;
}

// ── TRANSACTION MODAL ──
function openTxnModal(module, preType){
  const today=new Date().toISOString().split("T")[0];
  document.getElementById("txn_module").value=module||"ar";
  document.getElementById("txn_id").value="";
  document.getElementById("txn_date").value=today;
  document.getElementById("txn_ref").value="";
  document.getElementById("txn_party").value="";
  document.getElementById("txn_notes").value="";
  document.getElementById("txn_due").value="";
  document.getElementById("txn_status").value="posted";
  document.getElementById("txn_paymode").value="credit";
  // Set party datalist
  const dl=document.getElementById("txn_party_list");
  const partyList = module==="ap" ? SUPPLIERS.map(s=>s.name) : CUSTS.map(c=>c.name);
  dl.innerHTML=partyList.map(n=>`<option value="${n}"/>`).join("");
  // Set type default
  const typeMap={ar:"sale", ap:"purchase", inv:"stock_in"};
  document.getElementById("txn_type").value=preType||(typeMap[module]||"sale");
  // Init lines
  _txnLines=[];_txnLineId=1;
  addTxnLine();
  onTxnTypeChange();
  document.getElementById("txnModal").classList.add("open");
}
function closeTxnModal(){document.getElementById("txnModal").classList.remove("open");}

function onTxnTypeChange(){
  const t=document.getElementById("txn_type").value;
  const isMoneyOnly=["receipt","payment"].includes(t);
  document.getElementById("txn_items_section").style.display=isMoneyOnly?"none":"block";
  document.getElementById("txn_amount_row").style.display=isMoneyOnly?"block":"none";
  // Labels
  const isAP=["purchase","purchase_return","payment"].includes(t);
  document.getElementById("txn_party_label").textContent=isAP?"Supplier *":"Customer *";
  document.getElementById("txn_ref_label").textContent=isAP?"Bill / Invoice No.":"Invoice / Order No.";
  // Update txn title
  document.getElementById("txnTitle").textContent=txnTypeLabel(t)+" Entry";
}

function addTxnLine(){
  const id=_txnLineId++;
  _txnLines.push({id, productId:"", qty:1, uomId:"", rate:0, amount:0});
  renderTxnLines();
}

function removeTxnLine(id){
  _txnLines=_txnLines.filter(l=>l.id!==id);
  renderTxnLines();
}

function renderTxnLines(){
  const wrap=document.getElementById("txn_line_rows");
  if(!wrap)return;
  wrap.innerHTML=_txnLines.map(l=>`
    <div style="display:grid;grid-template-columns:2fr 60px 70px 80px 80px 28px;align-items:center;border-top:1px solid var(--border);padding:6px 10px;gap:6px">
      <select onchange="onTxnProductChange(${l.id},this.value)" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;outline:none">
        <option value="">Select product…</option>
        ${PRODUCTS.map(p=>`<option value="${p.id}" ${l.productId==p.id?"selected":""}>${p.name}</option>`).join("")}
      </select>
      <input type="number" min="0" value="${l.qty}" onchange="onTxnLineChange(${l.id},'qty',this.value)" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;outline:none"/>
      <select onchange="onTxnLineChange(${l.id},'uomId',this.value)" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:11px;outline:none">
function saveTxn(){
  const type=document.getElementById("txn_type").value;
  const date=document.getElementById("txn_date").value;
  const party=document.getElementById("txn_party").value.trim();
  const ref=document.getElementById("txn_ref").value.trim();
  const notes=document.getElementById("txn_notes").value.trim();
  const paymode=document.getElementById("txn_paymode").value;
  const due=document.getElementById("txn_due").value;
  const status=document.getElementById("txn_status").value;
  const module=document.getElementById("txn_module").value;
  if(!date){showAdminToast("⚠️ Date required");return;}
  if(!party){showAdminToast("⚠️ Party name required");return;}
  const isMoneyOnly=["receipt","payment"].includes(type);
  let total=0;
  if(isMoneyOnly){
    total=parseFloat(document.getElementById("txn_amount").value)||0;
    if(!total){showAdminToast("⚠️ Amount required");return;}
  } else {
    if(!_txnLines.length||!_txnLines.some(l=>l.productId)){showAdminToast("⚠️ Add at least one product");return;}
    total=calcTxnTotal();
  }
  // Generate ref if blank
  const autoRef = ref || type.toUpperCase().substring(0,3)+"-"+String(Date.now()).slice(-5);
  const txnId = type.toUpperCase().substring(0,3)+"-"+String(Date.now()).slice(-5);
  // Post to AR ledger
  if(["sale","sale_return","receipt"].includes(type)){
    const isCredit=["sale_return","receipt"].includes(type);
    AR_TXN.push({id:AR_TXN.length+1,date,type,party,ref:autoRef,debit:isCredit?0:total,credit:isCredit?total:0,balance:0,paymode,due:due||null,status,notes});
    showAdminToast("✅ AR transaction posted!");
    buildAR();
  }
  // Post to AP ledger
  if(["purchase","purchase_return","payment"].includes(type)){
    const isDebit=["purchase_return","payment"].includes(type);
    AP_TXN.push({id:AP_TXN.length+1,date,type,party,ref:autoRef,debit:isDebit?total:0,credit:isDebit?0:total,balance:0,paymode,due:due||null,status,notes});
    showAdminToast("✅ AP transaction posted!");
    buildAP();
  }
  // Post item transactions (inventory)
  if(!isMoneyOnly){
    const isInbound=["purchase","purchase_return","stock_in","adjust"].includes(type);
    _txnLines.filter(l=>l.productId&&l.qty>0).forEach(l=>{
      ITEM_TXN.push({id:ITEM_TXN.length+1,date,txnId,type,productId:l.productId,qty:l.qty,uomId:l.uomId,direction:isInbound?"in":"out",rate:l.rate,amount:l.amount,party,ref:autoRef,notes});
      // Update product stock
      const p=PRODUCTS.find(x=>x.id===l.productId);
      if(p) p.stock = Math.max(0, p.stock+(isInbound?l.qty:-l.qty));
    });
    buildInventory();buildProds();renderProducts();
  }
  // Post to DB
  const dbModule = ["sale","sale_return","receipt"].includes(type) ? "ar" :
                   ["purchase","purchase_return","payment"].includes(type) ? "ap" : null;
  const isInbound=["purchase","purchase_return","stock_in","adjust"].includes(type);
  const dbPayload = {
    txn_date:date, txn_type:type, party_name:party, ref_doc:autoRef,
    debit_amt:  isMoneyOnly ? (["receipt","payment_return"].includes(type)?total:0) : (isInbound?0:total),
    credit_amt: isMoneyOnly ? (["payment","purchase"].includes(type)?total:0)       : (isInbound?total:0),
    payment_mode:paymode, due_date:due||null, status, notes
  };
  const promises = [];
  if(dbModule) promises.push(apiFetch('/'+dbModule, {method:'POST',body:JSON.stringify(dbPayload)}).catch(e=>console.error(e)));
  if(!isMoneyOnly){
    _txnLines.filter(l=>l.productId&&l.qty>0).forEach(l=>{
      promises.push(apiFetch('/inventory/transactions',{method:'POST',body:JSON.stringify({
        txn_ref:txnId, txn_type:type, direction:isInbound?"in":"out",
        txn_date:date, product_id:l.productId, qty:l.qty, uom_id:l.uomId,
        rate:l.rate, amount:l.amount, party_name:party, ref_doc:autoRef, notes
      })}).catch(e=>console.error(e)));
    });
  }
  Promise.all(promises).then(()=>{
    // Refresh relevant views
    if(dbModule==="ar") buildAR();
    if(dbModule==="ap") buildAP();
    if(!isMoneyOnly){ buildInventory(); buildProds(); loadFromAPI(); }
  });
  closeTxnModal();
}

// ── HELPERS ──
function txnTypeLabel(type){
  const map={sale:"📤 Sale",sale_return:"↩️ Sales Return",receipt:"✅ Receipt",purchase:"📥 Purchase",purchase_return:"↩️ Purchase Return",payment:"💸 Payment",stock_in:"➕ Stock In",stock_out:"➖ Stock Out",adjust:"🔧 Adjustment"};
  return map[type]||type;
}
function txnBadgeClass(type){
  const map={sale:"txn-sale",sale_return:"txn-return",receipt:"txn-receipt",purchase:"txn-purchase",purchase_return:"txn-return",payment:"txn-payment",stock_in:"txn-receipt",stock_out:"txn-sale",adjust:"txn-adjust"};
  return map[type]||"txn-adjust";
}
function statusBadgeCls(s){
  const m={pending:"b-pending",processing:"b-processing",shipped:"b-shipped",delivered:"b-delivered",cancelled:"b-cancelled"};
  return m[s]||"b-pending";
}
function statusBadge(s){
  const map={posted:"b-delivered",paid:"b-delivered",partial:"b-processing",draft:"b-pending",cancelled:"b-cancelled"};
  return map[s]||"b-pending";
}


// ═══════════════════════════════════════════════════
// PRICING POLICY MASTER
// ═══════════════════════════════════════════════════