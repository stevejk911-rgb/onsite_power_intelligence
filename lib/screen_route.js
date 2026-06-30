"use strict";
/* =============================================================================
 * /api/screen  and  /api/feedback  — drop-in for the existing zero-dependency
 * On-Site Power server. Same handler signature as the other routes:
 *   handler(URLSearchParams) -> Promise<json>
 *
 * GET /api/screen?lat=..&lon=..
 * GET /api/feedback?screen_id=..&vote=up|down[&accuracy=..&comment=..&role=..]
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * This route must return the SAME numbers the main app (app.html) shows for the
 * same coordinate, because the extension and the app are seen side by side.
 * To guarantee that, /api/screen consumes the EXACT same data the app does:
 *   - solar  : NREL PVWatts capacity_factor (0..1)  — identical to /api/solar
 *   - infra  : the same Overpass query as /api/infra, parsed with the same
 *              nearest-point-on-geometry distance math, reported in MILES
 *   - gas    : the app's mile-based bands (<=5 near, 5-18 lateral, >18 none)
 *   - months : the app's lead-time model (recip+BESS = 16 mo near, +6 lateral)
 *   - grid   : the same ISO / hot-market energization-year estimate
 * Screening-grade (+-40%). Not a utility study.
 * ========================================================================== */
const fs   = require("fs");
const path = require("path");

const NREL_KEY = process.env.NREL_API_KEY || "DEMO_KEY";
const UA = "OnSitePowerIntelligence/0.2 (behind-the-meter planning tool)";
const DATA_DIR = path.join(__dirname, "..", "data");
const KM_PER_MI = 1.609344;

/* ---- shared cache (same TTL as the rest of the server) -------------------- */
const cache = new Map(), TTL = 60 * 60 * 1000;
const ckey = (p) => JSON.stringify(p);
const cacheGet = (k) => { const e = cache.get(k); return e && Date.now() - e.t < TTL ? e.v : null; };
const cacheSet = (k, v) => { cache.set(k, { t: Date.now(), v }); return v; };

/* ---- distance helpers (miles) — match the app's analyzeInfra ---------------- */
function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.7613, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Nearest distance (mi) from the site to a line segment a-b, using a local
// equirectangular projection (accurate at the few-km scale we care about).
function distToSegMi(site, a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const latRef = toRad(site.lat);
  const X = (p) => toRad(p.lon) * Math.cos(latRef), Y = (p) => toRad(p.lat);
  const px = X(site), py = Y(site);
  const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const R = 3958.7613;
  return R * Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
// Nearest distance (mi) from the site to a way's geometry (array of {lat,lon})
// or a single node.
function nearestMi(site, pts) {
  if (!pts || !pts.length) return Infinity;
  if (pts.length === 1) return haversineMi(site.lat, site.lon, pts[0].lat, pts[0].lon);
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegMi(site, pts[i], pts[i + 1]);
    if (d < m) m = d;
  }
  return m;
}

async function getJSON(url, opts, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    if (!r.ok) throw new Error("upstream " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---- data sources (identical to the app's /api/* routes) ------------------- */
async function reverseGeo(lat, lon) {
  const k = ckey(["rev", lat.toFixed(3), lon.toFixed(3)]);
  const hit = cacheGet(k); if (hit) return hit;
  try {
    const u = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1" +
              "&accept-language=en&zoom=8&lat=" + lat + "&lon=" + lon;
    const j = await getJSON(u, { headers: { "User-Agent": UA } });
    const a = j.address || {};
    return cacheSet(k, { state: a.state || null, county: a.county || null });
  } catch { return { state: null, county: null }; }
}

// Same Overpass query the app's /api/infra route uses (d=0.10 box, line +
// substation + plant + generator + gas pipeline), parsed in miles with the
// nearest-point-on-geometry distance — so the extension's distances equal the
// app's exactly.
async function nearbyInfra(lat, lon) {
  const k = ckey(["infra_mi", lat.toFixed(3), lon.toFixed(3)]);
  const hit = cacheGet(k); if (hit) return hit;
  const d = 0.10;
  const bb = (lat - d) + "," + (lon - d) + "," + (lat + d) + "," + (lon + d);
  const query = "[out:json][timeout:25];(" +
    'way["power"="line"](' + bb + ');' +
    'way["power"="substation"](' + bb + ');node["power"="substation"](' + bb + ');' +
    'way["power"="plant"](' + bb + ');node["power"="plant"](' + bb + ');' +
    'way["power"="generator"](' + bb + ');node["power"="generator"](' + bb + ');' +
    'way["man_made"="pipeline"]["substance"~"gas",i](' + bb + ');' +
    ");out tags geom;";
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (let attempt = 0; attempt < endpoints.length; attempt++) {
    try {
      const j = await getJSON(endpoints[attempt], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: "data=" + encodeURIComponent(query)
      }, 13000);
      let gas = Infinity, line = Infinity, sub = Infinity;
      const site = { lat, lon };
      for (const el of (j.elements || [])) {
        const tg = el.tags || {};
        const pts = el.geometry ? el.geometry
          : (el.lat != null ? [{ lat: el.lat, lon: el.lon }]
          : (el.center ? [{ lat: el.center.lat, lon: el.center.lon }] : null));
        const dmin = nearestMi(site, pts);
        if (dmin === Infinity) continue;
        if (tg.man_made === "pipeline") gas = Math.min(gas, dmin);
        else if (tg.power === "line") line = Math.min(line, dmin);
        else if (tg.power === "substation") sub = Math.min(sub, dmin);
      }
      const fix = (x) => (x === Infinity ? null : Math.round(x * 10) / 10);
      return cacheSet(k, { gas_mi: fix(gas), line_mi: fix(line), substation_mi: fix(sub), source: "osm" });
    } catch { /* try next endpoint */ }
  }
  return { gas_mi: null, line_mi: null, substation_mi: null, source: "unavailable" };
}

// Same source the app's /api/solar route uses: NREL PVWatts capacity_factor.
// Returns cf in 0..1 (e.g. 0.14 = 14%) so the extension shows the same % the app does.
async function solarResource(lat, lon) {
  const k = ckey(["solar_cf", lat.toFixed(3), lon.toFixed(3)]);
  const hit = cacheGet(k); if (hit) return hit;
  try {
    const u = "https://developer.nrel.gov/api/pvwatts/v8.json?api_key=" + NREL_KEY +
      "&lat=" + lat + "&lon=" + lon +
      "&system_capacity=1&azimuth=180&tilt=20&array_type=2&module_type=0&losses=14";
    const j = await getJSON(u);
    const o = j.outputs || {};
    const cf = typeof o.capacity_factor === "number" ? Math.round(o.capacity_factor) / 100 : null;
    return cacheSet(k, { cf, source: cf != null ? "nrel" : "unavailable" });
  } catch { return { cf: null, source: "unavailable" }; }
}

/* ---- grid estimate (calibrated 2026; recalibrate from feedback) ----------- */
const NOW = new Date().getFullYear();
const STATE_ABBR = { "Virginia":"VA","Ohio":"OH","Pennsylvania":"PA","Maryland":"MD","New Jersey":"NJ",
  "Delaware":"DE","District of Columbia":"DC","West Virginia":"WV","Kentucky":"KY","Indiana":"IN",
  "Texas":"TX","California":"CA","Michigan":"MI","Illinois":"IL","Wisconsin":"WI","Minnesota":"MN",
  "Iowa":"IA","Missouri":"MO","Arkansas":"AR","Louisiana":"LA","Mississippi":"MS","North Dakota":"ND",
  "South Dakota":"SD","Kansas":"KS","Oklahoma":"OK","Nebraska":"NE","New York":"NY","Massachusetts":"MA",
  "Connecticut":"CT","Maine":"ME","New Hampshire":"NH","Vermont":"VT","Rhode Island":"RI","Georgia":"GA",
  "Alabama":"AL","North Carolina":"NC","South Carolina":"SC","Tennessee":"TN","Florida":"FL","Arizona":"AZ",
  "Nevada":"NV","Utah":"UT","Colorado":"CO","New Mexico":"NM","Idaho":"ID","Oregon":"OR","Washington":"WA",
  "Montana":"MT","Wyoming":"WY" };
const STATE_TO_ISO = { VA:"PJM",OH:"PJM",PA:"PJM",MD:"PJM",NJ:"PJM",DE:"PJM",DC:"PJM",WV:"PJM",KY:"PJM",IN:"PJM",
  TX:"ERCOT",CA:"CAISO",MI:"MISO",IL:"MISO",WI:"MISO",MN:"MISO",IA:"MISO",MO:"MISO",AR:"MISO",LA:"MISO",
  MS:"MISO",ND:"MISO",SD:"MISO",KS:"SPP",OK:"SPP",NE:"SPP",NY:"NYISO",MA:"ISO-NE",CT:"ISO-NE",ME:"ISO-NE",
  NH:"ISO-NE",VT:"ISO-NE",RI:"ISO-NE",GA:"SERC",AL:"SERC",NC:"SERC",SC:"SERC",TN:"SERC",FL:"SERC",
  AZ:"WECC",NV:"WECC",UT:"WECC",CO:"WECC",NM:"WECC",ID:"WECC",OR:"WECC",WA:"WECC",MT:"WECC",WY:"WECC" };
const ISO_YEAR = { PJM:2031,ERCOT:2030,CAISO:2031,MISO:2030,NYISO:2030,"ISO-NE":2030,SPP:2029,SERC:2029,WECC:2030 };
const HOT_MARKETS = [
  { label:"Northern Virginia", st:"VA", co:["loudoun","prince william","fauquier","fairfax","stafford","spotsylvania"], year:2032, note:"Dominion's large-load queue runs ~7 years; new connections not before ~2031-2033." },
  { label:"Central Ohio (Columbus)", st:"OH", co:["franklin","licking","delaware","union","fairfield"], year:2031, note:"AEP Ohio large-load tariff; PJM-constrained." },
  { label:"Phoenix", st:"AZ", co:["maricopa","pinal"], year:2030, note:"APS large-load tariff; constrained queue." },
  { label:"Dallas-Fort Worth", st:"TX", co:["tarrant","dallas","denton","ellis","collin","kaufman"], year:2030, note:"ERCOT Batch Zero may allow a partial on-ramp earlier." },
  { label:"Abilene / West Texas", st:"TX", co:["taylor","nolan","jones"], year:2029, note:"ERCOT west; faster partial energization possible." },
  { label:"Chicago", st:"IL", co:["cook","dupage","will","kane"], year:2030, note:"ComEd/PJM constrained." },
  { label:"Reno / Tahoe-Reno", st:"NV", co:["washoe","storey","lyon"], year:2029, note:"NV Energy; improving." },
  { label:"Atlanta", st:"GA", co:["fulton","douglas","coweta","fayette","dekalb","gwinnett","cobb","paulding"], year:2028, note:"Georgia Power: strong available capacity; led US net absorption in 2024." }
];
function gridEstimate(stateName, county, lat) {
  const st = stateName ? STATE_ABBR[stateName] || null : null;
  const c = (county || "").toLowerCase();
  const hot = st ? HOT_MARKETS.find(m => m.st === st && m.co.some(x => c.includes(x))) : null;
  let iso = st ? STATE_TO_ISO[st] || null : null;
  if (st === "IL" && lat != null && lat >= 40.0) iso = "PJM"; // ComEd / northern Illinois (split from MISO)
  const year = hot ? hot.year : (iso && ISO_YEAR[iso]) || 2030;
  const label = hot ? hot.label : (iso || "this region");
  return { iso, market: hot ? hot.label : null, label, energization_year_est: year, note: hot ? hot.note : null, confidence: "screening" };
}

// Proximity-aware grid verdict (miles). Regional queue year alone over-flags KILL
// on parcels that already sit next to grid infrastructure (operating sites).
function gridVerdict(g, infra) {
  const gy = g.energization_year_est, fast = (gy - NOW) <= 3;
  const tx = infra.line_mi, sub = infra.substation_mi;
  const near = (tx != null && tx <= 1.0) || (sub != null && sub <= 1.25);
  const known = (tx != null || sub != null);
  const far = (tx == null || tx > 3) && (sub == null || sub > 3);
  const nums = [tx, sub].filter((v) => v != null).sort((a, b) => a - b);
  const minmi = nums.length ? nums[0] : null;
  const tail = (g.note ? " " + g.note : "") + " Confirm available capacity with the utility queue.";
  if (fast) return { verdict: "ADVANCE", reason: `Grid energization in ${g.label} (~${gy}) may fit a normal build window.` + tail };
  if (near) return { verdict: "CHECK", reason: `Transmission/substation is adjacent (~${minmi} mi), so existing or upgradeable grid capacity may be available here — but new large-load interconnection in ${g.label} runs ~${gy}.` + tail };
  if (known && far) return { verdict: "KILL", reason: `No grid infrastructure within several miles, and new large-load interconnection in ${g.label} runs ~${gy}, so the grid path is unlikely within a typical build window.` + tail };
  return { verdict: "CHECK", reason: `New large-load interconnection in ${g.label} runs ~${gy} (regional estimate); nearby grid infrastructure couldn't be confirmed from open data.` + tail };
}

/* ---- behind-the-meter paths (mile bands + months match the app) ------------ */
// app.html buildScenarios:  gasNear = d<=5mi, gasLateral = 5<d<=18mi (+6 mo),
// gasNone = d>18mi.  Recip+BESS = 16 mo when near, +6 when a lateral is needed.
function gasPath(mi) {
  if (mi == null) return { verdict:"CHECK", note:"No gas transmission found nearby in open data. Verify on PHMSA NPMS.", fastest_months_est:null };
  if (mi <= 5)  return { verdict:"ADVANCE", note:`Gas transmission line ~${mi} mi away; recip + BESS bridge viable.`, fastest_months_est:16 };
  if (mi <= 18) return { verdict:"ADVANCE", note:`Gas line ~${mi} mi; a lateral is buildable (recip + BESS), add ~6 months.`, fastest_months_est:22 };
  return { verdict:"CHECK", note:`Nearest gas line ~${mi} mi; likely too far for an economical tap — verify on PHMSA NPMS.`, fastest_months_est:null };
}
function cap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
function solarRating(cf){ return cf == null ? "unknown" : cf >= 0.20 ? "strong" : cf >= 0.16 ? "good" : "modest"; }

async function buildVerdict(lat, lon) {
  const [{ state, county }, infra, solar] = await Promise.all([
    reverseGeo(lat, lon), nearbyInfra(lat, lon), solarResource(lat, lon)
  ]);
  const grid = gridEstimate(state, county, lat);
  const gv = gridVerdict(grid, infra);
  const gas = gasPath(infra.gas_mi);
  const cfPct = solar.cf != null ? Math.round(solar.cf * 100) : null;
  const solar_bess = solar.cf == null
    ? { verdict:"CHECK", note:"Solar resource unavailable right now; verify on NREL PVWatts." }
    : { verdict:"PARTIAL", note:`Solar capacity factor ~${cfPct}% (${solarRating(solar.cf)}). A supplement, not firm alone for a 24/7 load.` };
  const fuel_cell = { verdict:"CHECK", note: gas.verdict === "ADVANCE"
    ? "Gas is nearby, so fuel cells are an option; confirm OEM lead times."
    : "Depends on securing gas supply (see gas path) and OEM lead times." };
  const fastest_path = gas.verdict === "ADVANCE" ? "gas" : "none";
  const anyAdvance = gas.verdict === "ADVANCE";
  const fastMo = gas.fastest_months_est || 18;
  let overall;
  if (anyAdvance) {
    overall = { verdict: "ADVANCE",
      reason: `At least one on-site path looks viable here (fastest: ~${fastMo} mo, gas + BESS). The grid alone is slower (~${grid.energization_year_est}). Worth advancing to a feasibility study.` };
  } else if (gv.verdict === "ADVANCE") {
    overall = { verdict: "ADVANCE", reason: `Grid energization (~${grid.energization_year_est}) may fit a normal build window.` };
  } else if (gv.verdict === "KILL") {
    overall = { verdict: "KILL", reason: `No fast grid path and no on-site option found nearby in open data. Likely a kill — verify before committing.` };
  } else {
    overall = { verdict: "CHECK", reason: `Grid is slow (~${grid.energization_year_est}) and on-site options couldn't be confirmed from open data. Verify gas/transmission before advancing.` };
  }
  const screen_id = "scr_" + Math.random().toString(16).slice(2, 12);
  return {
    screen_id, lat, lon,
    market: { state, county, iso: grid.iso, hot_market: grid.market },
    overall,
    grid: { verdict: gv.verdict, energization_year_est: grid.energization_year_est, reason: gv.reason, confidence: grid.confidence },
    btm: { gas, solar_bess, fuel_cell },
    fastest_path, fastest_months_est: anyAdvance ? fastMo : null, any_path_advance: anyAdvance,
    // distances reported in MILES to match the app; *_km kept for back-compat
    infra: {
      gas_mi: infra.gas_mi, transmission_mi: infra.line_mi, substation_mi: infra.substation_mi,
      gas_km: infra.gas_mi == null ? null : Math.round(infra.gas_mi * KM_PER_MI * 10) / 10,
      transmission_km: infra.line_mi == null ? null : Math.round(infra.line_mi * KM_PER_MI * 10) / 10,
      substation_km: infra.substation_mi == null ? null : Math.round(infra.substation_mi * KM_PER_MI * 10) / 10,
      source: infra.source
    },
    solar: { capacity_factor: solar.cf, cf_percent: cfPct, rating: solarRating(solar.cf), source: solar.source },
    verify: [
      { factor:"queue", sources:[{label:"Grid Status",url:"https://www.gridstatus.io/interconnection-queue"},{label:"Interconnection.fyi",url:"https://www.interconnection.fyi/"}] },
      { factor:"gas",   sources:[{label:"PHMSA NPMS",url:"https://www.npms.phmsa.dot.gov/PublicViewer/"},{label:"Open Infrastructure Map",url:"https://openinframap.org/"}] },
      { factor:"solar", sources:[{label:"NREL PVWatts",url:"https://pvwatts.nrel.gov/"}] }
    ],
    share_url: "https://onsitespower.com/v/" + screen_id,
    ts: new Date().toISOString()
  };
}

/* ---- logging (flywheel) --------------------------------------------------- */
function appendLog(file, obj) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(path.join(DATA_DIR, file), JSON.stringify(obj) + "\n"); }
  catch (e) { console.error("log error", e.message); }
}

/* ---- route handlers (match existing signature) ---------------------------- */
async function screen(q) {
  const lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) throw new Error("lat/lon required");
  const r = await buildVerdict(lat, lon);
  appendLog("screen_events.jsonl", {
    screen_id:r.screen_id, ts:r.ts, lat, lon,
    geo_market: r.market.hot_market || r.market.iso || r.market.state,
    source: q.get("source") || "api", utm_source: q.get("utm") || null,
    grid_verdict: r.grid.verdict, grid_energization_year: r.grid.energization_year_est,
    btm_fastest_path: r.fastest_path, any_path_advance: r.any_path_advance
  });
  return r;
}
async function feedback(q) {
  const screen_id = q.get("screen_id"), vote = q.get("vote");
  if (!screen_id || !["up","down"].includes(vote)) throw new Error("screen_id and vote=up|down required");
  appendLog("screen_feedback.jsonl", {
    feedback_id:"fb_"+Date.now().toString(36), screen_id, ts:new Date().toISOString(),
    vote, accuracy:q.get("accuracy")||null, comment:q.get("comment")||null, role:q.get("role")||null
  });
  return { ok: true };
}

module.exports = { screen, feedback, buildVerdict, gridEstimate };
