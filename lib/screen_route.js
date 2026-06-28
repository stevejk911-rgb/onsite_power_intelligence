"use strict";
/* =============================================================================
 * /api/screen  and  /api/feedback  — drop-in for the existing zero-dependency
 * On-Site Power server. Same handler signature as the other routes:
 *   handler(URLSearchParams) -> Promise<json>
 *
 * GET /api/screen?lat=..&lon=..
 * GET /api/feedback?screen_id=..&vote=up|down[&accuracy=..&comment=..&role=..]
 *
 * Reuses the same open data sources already in this app (Nominatim, Overpass,
 * NREL PVWatts), adds an ISO/county grid-energization estimate, and returns a
 * single ADVANCE/KILL verdict plus behind-the-meter paths.
 * Screening-grade (±40%). Not a utility study.
 * ========================================================================== */
const fs   = require("fs");
const path = require("path");

const NREL_KEY = process.env.NREL_API_KEY || "DEMO_KEY";
const UA = "OnSitePowerIntelligence/0.2 (behind-the-meter planning tool)";
const DATA_DIR = path.join(__dirname, "..", "data");

/* ---- small cache ---------------------------------------------------------- */
const cache = new Map(), TTL = 60 * 60 * 1000;
const ckey = (p) => JSON.stringify(p);
const cacheGet = (k) => { const e = cache.get(k); return e && Date.now() - e.t < TTL ? e.v : null; };
const cacheSet = (k, v) => { cache.set(k, { t: Date.now(), v }); return v; };

/* ---- helpers -------------------------------------------------------------- */
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
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

/* ---- data sources --------------------------------------------------------- */
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

async function nearbyInfra(lat, lon) {
  const k = ckey(["infra2", lat.toFixed(3), lon.toFixed(3)]);
  const hit = cacheGet(k); if (hit) return hit;
  const d = 0.12;
  const bb = (lat - d) + "," + (lon - d) + "," + (lat + d) + "," + (lon + d);
  const query = "[out:json][timeout:25];(" +
    'way["power"="line"](' + bb + ');' +
    'way["power"="substation"](' + bb + ');node["power"="substation"](' + bb + ');' +
    'way["man_made"="pipeline"]["substance"~"gas|natural_gas",i](' + bb + ');' +
    ");out tags center;";
  try {
    const j = await getJSON("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(query)
    }, 12000);
    let gas = Infinity, line = Infinity, sub = Infinity;
    for (const el of (j.elements || [])) {
      const c = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
      if (!c) continue;
      const dist = haversineKm(lat, lon, c.lat, c.lon), tg = el.tags || {};
      if (tg.man_made === "pipeline") gas = Math.min(gas, dist);
      else if (tg.power === "line") line = Math.min(line, dist);
      else if (tg.power === "substation") sub = Math.min(sub, dist);
    }
    const fix = (x) => (x === Infinity ? null : Math.round(x * 10) / 10);
    return cacheSet(k, { gas_km: fix(gas), line_km: fix(line), substation_km: fix(sub), source: "osm" });
  } catch { return { gas_km: null, line_km: null, substation_km: null, source: "unavailable" }; }
}

async function solarResource(lat, lon) {
  const k = ckey(["solar2", lat.toFixed(3), lon.toFixed(3)]);
  const hit = cacheGet(k); if (hit) return hit;
  try {
    const u = "https://developer.nrel.gov/api/pvwatts/v8.json?api_key=" + NREL_KEY +
      "&lat=" + lat + "&lon=" + lon +
      "&system_capacity=1&azimuth=180&tilt=20&array_type=2&module_type=0&losses=14";
    const j = await getJSON(u);
    const o = j.outputs || {};
    const kwh = typeof o.ac_annual === "number" ? Math.round(o.ac_annual) : null;
    let rating = "unknown";
    if (kwh != null) rating = kwh >= 1900 ? "strong" : kwh >= 1500 ? "good" : "modest";
    return cacheSet(k, { kwh_per_kw_yr: kwh, rating, source: kwh != null ? "nrel" : "unavailable" });
  } catch { return { kwh_per_kw_yr: null, rating: "unknown", source: "unavailable" }; }
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
function gridEstimate(stateName, county) {
  const st = stateName ? STATE_ABBR[stateName] || null : null;
  const c = (county || "").toLowerCase();
  const hot = st ? HOT_MARKETS.find(m => m.st === st && m.co.some(x => c.includes(x))) : null;
  const iso = st ? STATE_TO_ISO[st] || null : null;
  const year = hot ? hot.year : (iso && ISO_YEAR[iso]) || 2030;
  const label = hot ? hot.label : (iso || "this region");
  const yearsOut = year - NOW;
  const verdict = yearsOut > 3 ? "KILL" : "ADVANCE";
  const base = verdict === "KILL"
    ? `Large-load interconnection in ${label} realistically energizes around ${year}, past a typical build window.`
    : `Grid energization in ${label} (~${year}) may fit a normal build window.`;
  return { iso, market: hot ? hot.label : null, energization_year_est: year, verdict,
           reason: (hot ? base + " " + hot.note : base) + " Confirm with the utility queue.", confidence: "screening" };
}

/* ---- verdict assembly ----------------------------------------------------- */
function gasPath(km) {
  if (km == null) return { verdict:"CHECK", note:"No gas transmission found nearby in open data. Verify on PHMSA NPMS." };
  if (km <= 5)   return { verdict:"ADVANCE", note:`Gas transmission line ~${km} km away; recip + BESS bridge viable.`, fastest_months_est:18 };
  if (km <= 16)  return { verdict:"CHECK", note:`Nearest gas line ~${km} km; tap may be feasible, check capacity/cost.` };
  return { verdict:"KILL", note:`Nearest gas line ~${km} km; likely too far for an economical tap.` };
}
function cap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

async function buildVerdict(lat, lon) {
  const [{ state, county }, infra, solar] = await Promise.all([
    reverseGeo(lat, lon), nearbyInfra(lat, lon), solarResource(lat, lon)
  ]);
  const grid = gridEstimate(state, county);
  const gas = gasPath(infra.gas_km);
  const solar_bess = solar.rating === "unknown"
    ? { verdict:"CHECK", note:"Solar resource unavailable right now; verify on NREL PVWatts." }
    : { verdict:"PARTIAL", note:`${cap(solar.rating)} solar resource (~${solar.kwh_per_kw_yr} kWh/kW/yr). A supplement, not firm alone for a 24/7 load.` };
  const fuel_cell = { verdict:"CHECK", note: gas.verdict === "ADVANCE"
    ? "Gas is nearby, so fuel cells are an option; confirm OEM lead times."
    : "Depends on securing gas supply (see gas path) and OEM lead times." };
  const fastest_path = gas.verdict === "ADVANCE" ? "gas" : "none";
  const screen_id = "scr_" + Math.random().toString(16).slice(2, 12);
  return {
    screen_id, lat, lon,
    market: { state, county, iso: grid.iso, hot_market: grid.market },
    grid: { verdict: grid.verdict, energization_year_est: grid.energization_year_est, reason: grid.reason, confidence: grid.confidence },
    btm: { gas, solar_bess, fuel_cell },
    fastest_path, any_path_advance: gas.verdict === "ADVANCE",
    infra: { gas_km: infra.gas_km, transmission_km: infra.line_km, substation_km: infra.substation_km, source: infra.source },
    solar: { kwh_per_kw_yr: solar.kwh_per_kw_yr, rating: solar.rating, source: solar.source },
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
