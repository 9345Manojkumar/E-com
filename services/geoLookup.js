'use strict';

// services/geoLookup.js
// Resolves an IP address to country/region/city using ip-api.com's free
// tier (45 requests/min, no API key required, HTTPS — works on Render).
//
// Results are cached in-memory per IP for 24h to stay well under the
// rate limit and avoid slowing down every single page view.

const cache = new Map(); // ip -> { data, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PRIVATE_IP_RANGES = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^::1$/, /^localhost$/i,
];

function isPrivateIP(ip) {
  return !ip || PRIVATE_IP_RANGES.some(re => re.test(ip));
}

async function lookupGeo(ip) {
  if (isPrivateIP(ip)) {
    return { country: null, region: null, city: null };
  }

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const resp = await fetch(`https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`);
    const json = await resp.json();
    const data = json.status === 'success'
      ? { country: json.country || null, region: json.regionName || null, city: json.city || null }
      : { country: null, region: null, city: null };

    cache.set(ip, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (e) {
    console.error('Geo lookup failed:', e.message);
    return { country: null, region: null, city: null };
  }
}

module.exports = { lookupGeo, isPrivateIP };
