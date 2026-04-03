// services/shiprocket.js — Palm Legacy v3.2
// Full Shiprocket API flow per official docs (https://apidocs.shiprocket.in)
// Steps: 1.Auth → 3.Serviceability → 4.CreateOrder → 5.AssignAWB →
//        6.GeneratePickup → 7.GenerateManifest → 8.PrintManifest →
//        9.GenerateLabel → 10.PrintInvoice → 11.Track
// Credentials → .env: SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD
"use strict";

const SR_BASE = "https://apiv2.shiprocket.in/v1/external";

// Token cache — valid 240 hours (10 days) per Shiprocket docs
let _token    = null;
let _tokenExp = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const email    = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password)
    throw new Error("SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD must be set in .env");
  const res  = await fetch(`${SR_BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body:   JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token)
    throw new Error("Shiprocket auth failed: " + (data.message || JSON.stringify(data)));
  _token    = data.token;
  _tokenExp = Date.now() + (238 * 60 * 60 * 1000); // 238h (2h early safety margin)
  console.log("✅ Shiprocket token refreshed (valid 10 days)");
  return _token;
}

async function refreshToken() { _token = null; _tokenExp = 0; return getToken(); }

async function srFetch(path, options = {}) {
  const token = await getToken();
  const doReq = (t) => fetch(`${SR_BASE}${path}`, {
    ...options,
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${t}`, ...(options.headers||{}) },
  });
  let res = await doReq(token);
  if (res.status === 401) { const t2 = await refreshToken(); res = await doReq(t2); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// STEP 3: Check courier serviceability
async function checkServiceability(pickupPin, deliveryPin, weight = 0.5, cod = 0) {
  const p = new URLSearchParams({ pickup_postcode:pickupPin, delivery_postcode:deliveryPin, weight, cod });
  const data = await srFetch(`/courier/serviceability/?${p}`);
  const couriers = data?.data?.available_courier_companies || [];
  return {
    serviceable: couriers.length > 0,
    couriers: couriers.map(c => ({ id:c.courier_company_id, name:c.courier_name, rate:c.rate, etd:c.etd, cod:c.cod===1 })),
    recommended: couriers[0] || null,
  };
}

// STEP 4: Create Shiprocket order
async function createShiprocketOrder(order, items) {
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";
  const channelId      = process.env.SHIPROCKET_CHANNEL_ID;
  const nameParts = (order.customer_name || "").split(" ");
  const payload = {
    order_id:              order.order_number,
    order_date:            (order.ordered_at || order.created_at || new Date()).toString().substring(0,10),
    pickup_location:       pickupLocation,
    ...(channelId ? { channel_id: channelId } : {}),
    billing_customer_name: nameParts.slice(0,-1).join(" ") || order.customer_name,
    billing_last_name:     nameParts.slice(-1)[0] || "",
    billing_address:       (order.delivery_address || "").slice(0,200),
    billing_address_2:     "",
    billing_city:          order.city    || "",
    billing_pincode:       order.pincode || "",
    billing_state:         order.state   || "",
    billing_country:       "India",
    billing_email:         order.customer_email  || "",
    billing_phone:         order.customer_mobile || "",
    shipping_is_billing:   true,
    order_items: items.map(i => ({
      name: i.product_name, sku: `SKU-${i.product_id||0}`,
      units: parseInt(i.quantity,10), selling_price: parseFloat(i.unit_price),
      discount:0, tax:0, hsn:0,
    })),
    payment_method: order.payment_method === "cod" ? "COD" : "Prepaid",
    sub_total:      parseFloat(order.grand_total || order.subtotal || 0),
    length:15, breadth:12, height:10, weight:0.5,
  };
  const data = await srFetch("/orders/create/adhoc", { method:"POST", body:JSON.stringify(payload) });
  return { shiprocket_order_id:String(data.order_id||""), shiprocket_shipment_id:String(data.shipment_id||"") };
}

// STEP 5: Assign courier + generate AWB
async function assignCourier(shipmentId, courierId = null) {
  const body = { shipment_id: String(shipmentId) };
  if (courierId) body.courier_id = courierId;
  const data = await srFetch("/courier/assign/awb", { method:"POST", body:JSON.stringify(body) });
  const resp = data?.response?.data;
  const awb  = resp?.awb_code || data?.awb_code || "";
  return { awb_code:awb, courier_name:resp?.courier_name||data?.courier_name||"", tracking_url:awb?`https://shiprocket.co/tracking/${awb}`:"" };
}

// STEP 6: Generate pickup request
async function generatePickup(shipmentId) {
  const data = await srFetch("/courier/generate/pickup", { method:"POST", body:JSON.stringify({ shipment_id:[String(shipmentId)] }) });
  return { success: data?.pickup_status===1 || !!data?.response, message: data?.response?.data?.pickup_scheduled_date || "Pickup scheduled", raw:data };
}

// STEP 7: Generate manifest
async function generateManifest(shipmentIds) {
  const ids = (Array.isArray(shipmentIds)?shipmentIds:[shipmentIds]).map(String);
  const data = await srFetch("/manifests/generate", { method:"POST", body:JSON.stringify({ shipment_id:ids }) });
  return { manifest_url:data?.manifest_url||"", raw:data };
}

// STEP 8: Print manifest PDF
async function printManifest(orderId) {
  const data = await srFetch("/manifests/print", { method:"POST", body:JSON.stringify({ order_ids:[String(orderId)] }) });
  return { manifest_url:data?.manifest_url||"", raw:data };
}

// STEP 9: Generate shipping label PDF
async function generateLabel(shipmentId) {
  const data = await srFetch("/courier/generate/label", { method:"POST", body:JSON.stringify({ shipment_id:[String(shipmentId)] }) });
  return { label_url:data?.label_url||"", raw:data };
}

// STEP 10: Print Shiprocket invoice PDF
async function printShiprocketInvoice(orderId) {
  const data = await srFetch("/orders/print/invoice", { method:"POST", body:JSON.stringify({ ids:[String(orderId)] }) });
  return { invoice_url:data?.invoice_url||"", raw:data };
}

// STEP 11: Track shipment by AWB code
async function trackShipment(awbCode) {
  const data  = await srFetch(`/courier/track/awb/${awbCode}`);
  const track = data?.tracking_data?.shipment_track?.[0];
  const scans = data?.tracking_data?.shipment_track_activities || [];
  const status = track?.current_status || "Unknown";
  return {
    status,
    delivered:    status.toLowerCase().includes("delivered"),
    etd:          track?.etd          || "",
    awb_code:     track?.awb_code     || awbCode,
    courier_name: track?.courier_name || "",
    tracking_url: `https://shiprocket.co/tracking/${awbCode}`,
    origin:       track?.origin       || "",
    destination:  track?.destination  || "",
    timeline: scans.slice(0,10).map(s => ({
      date:s.date||"", activity:s.activity||s.status||"", location:s.location||"", status:s.status||"",
    })),
  };
}

function isConfigured() { return !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD); }

module.exports = { getToken, refreshToken, checkServiceability, createShiprocketOrder, assignCourier, generatePickup, generateManifest, printManifest, generateLabel, printShiprocketInvoice, trackShipment, isConfigured };
