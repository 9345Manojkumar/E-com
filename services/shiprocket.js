'use strict';

// ── Shiprocket API Service ─────────────────────────────────────────
// Reads credentials from .env: SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD
// Optional: SHIPROCKET_PICKUP_LOCATION (default "Primary"), SHIPROCKET_CHANNEL_ID
//
// Implements every method called by server.js:
//   createShiprocketOrder, assignCourier, generatePickup,
//   generateManifest, printManifest, generateLabel,
//   printShiprocketInvoice, trackShipment, checkServiceability, isConfigured

const BASE = 'https://apiv2.shiprocket.in/v1/external';

let _token     = null;
let _tokenExp  = 0;

// ── Auth ──────────────────────────────────────────────────────────
async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;

  const res  = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      email:    process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!data.token)
    throw new Error('Shiprocket auth failed: ' + (data.message || JSON.stringify(data)));

  _token    = data.token;
  _tokenExp = Date.now() + 9 * 24 * 60 * 60 * 1000; // tokens last 10 days; refresh at 9
  return _token;
}

async function sr(method, path, body) {
  const token = await getToken();
  const res   = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      Authorization:   'Bearer ' + token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`Shiprocket ${method} ${path} → ${data.message || res.status}`);
  return data;
}

// ── Step 3: Check pincode serviceability ─────────────────────────
async function checkServiceability(fromPin, toPin, weight = 0.5, cod = 0) {
  return sr('GET',
    `/courier/serviceability/?pickup_postcode=${fromPin}&delivery_postcode=${toPin}&weight=${weight}&cod=${cod}`
  );
}

// ── Step 4: Create order in Shiprocket ───────────────────────────
async function createShiprocketOrder(order, items) {
  const channelId = process.env.SHIPROCKET_CHANNEL_ID
    ? parseInt(process.env.SHIPROCKET_CHANNEL_ID, 10)
    : undefined;

  const payload = {
    order_id:              order.order_number,
    order_date:            new Date(order.ordered_at || Date.now()).toISOString().split('T')[0],
    pickup_location:       process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    ...(channelId ? { channel_id: channelId } : {}),

    billing_customer_name: order.customer_name,
    billing_last_name:     '',
    billing_address:       order.delivery_address,
    billing_city:          order.city         || 'Chennai',
    billing_pincode:       order.pincode       || '600001',
    billing_state:         order.state         || 'Tamil Nadu',
    billing_country:       'India',
    billing_email:         order.customer_email || '',
    billing_phone:         order.customer_mobile,

    shipping_is_billing: true,

    order_items: items.map(i => ({
      name:          i.product_name || i.name,
      sku:           'SKU-' + (i.product_id || i.id || '0'),
      units:         parseInt(i.quantity || i.qty, 10),
      selling_price: parseFloat(i.unit_price || i.price),
      discount:      0,
      tax:           0,
      hsn:           '',
    })),

    payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
    sub_total:      parseFloat(order.grand_total),
    length:         15,
    breadth:        12,
    height:         8,
    weight:         0.5,
  };

  const data = await sr('POST', '/orders/create/adhoc', payload);
  return {
    shiprocket_order_id:    data.order_id,
    shiprocket_shipment_id: data.shipment_id,
  };
}

// ── Step 5: Assign courier + get AWB ─────────────────────────────
async function assignCourier(shipmentId) {
  const data = await sr('POST', '/courier/assign/awb', { shipment_id: String(shipmentId) });
  const awb  = data.response?.data?.awb_code || data.awb_code || null;
  return {
    awb_code:     awb,
    courier_name: data.response?.data?.courier_name || data.courier_name || '',
    tracking_url: awb ? `https://shiprocket.co/tracking/${awb}` : '',
  };
}

// ── Step 6: Generate pickup request ──────────────────────────────
async function generatePickup(shipmentId) {
  const data = await sr('POST', '/courier/generate/pickup', {
    shipment_id: [parseInt(shipmentId, 10)],
  });
  return { message: data.pickup_scheduled_date || data.response?.data?.message || 'Pickup requested' };
}

// ── Step 7: Generate manifest ─────────────────────────────────────
async function generateManifest(shipmentId) {
  const data = await sr('POST', '/manifests/generate', {
    shipment_id: [parseInt(shipmentId, 10)],
  });
  return { manifest_url: data.manifest_url || '' };
}

// ── Step 8: Print manifest ────────────────────────────────────────
async function printManifest(orderId) {
  const data = await sr('POST', '/manifests/print', {
    order_ids: [parseInt(orderId, 10)],
  });
  return { manifest_url: data.manifest_url || '' };
}

// ── Step 9: Generate shipping label ───────────────────────────────
async function generateLabel(shipmentId) {
  const data = await sr('POST', '/courier/generate/label', {
    shipment_id: [parseInt(shipmentId, 10)],
  });
  return { label_url: data.label_url || data.response?.label_url || '' };
}

// ── Step 10: Print Shiprocket invoice ─────────────────────────────
async function printShiprocketInvoice(orderId) {
  const data = await sr('POST', '/orders/print/invoice', {
    ids: [parseInt(orderId, 10)],
  });
  return { invoice_url: data.invoice_url || '' };
}

// ── Step 11: Track shipment by AWB ───────────────────────────────
async function trackShipment(awb) {
  const data = await sr('GET', `/courier/track/awb/${awb}`);
  const info = data.tracking_data || {};
  const shipmentTrack = info.shipment_track?.[0] || {};
  const activities    = info.shipment_track_activities || [];

  const currentStatus = shipmentTrack.current_status || '';
  const delivered     = /delivered/i.test(currentStatus);

  return {
    current_status:  currentStatus,
    delivered,
    estimated_date:  shipmentTrack.edd || null,
    courier_name:    shipmentTrack.courier || '',
    activities:      activities.slice(0, 10).map(a => ({
      date:     a.date,
      activity: a.activity,
      location: a.location,
    })),
  };
}

// ── Check if Shiprocket is configured ────────────────────────────
function isConfigured() {
  return !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

module.exports = {
  isConfigured,
  checkServiceability,
  createShiprocketOrder,
  assignCourier,
  generatePickup,
  generateManifest,
  printManifest,
  generateLabel,
  printShiprocketInvoice,
  trackShipment,
};