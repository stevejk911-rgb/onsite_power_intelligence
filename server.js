"use strict";
/* =============================================================================
 * On-Site Power Intelligence — backend
 * -----------------------------------------------------------------------------
 * A zero-dependency Node server (Node 18+ required for built-in fetch).
 * It serves the frontend and proxies open-data APIs so the browser never calls
 * them directly. The proxy layer fixes CORS, sets a proper User-Agent, hides the
 * API key, and caches responses.
 *
 *   Run:   node server.js        then open  http://localhost:8080
 *
 * Each /api/* route is one open-data source. Add new sources by following the
 * same pattern: a cache key, an upstream fetch, a normalized return shape.
 * ============================================================================= */
const http = require("http");
const fs   = require("fs");
const path = require("path");

/* ---- load .env if present (minimal, no dependency) ------------------------ */
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if(m && m[2] !== "" && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch(e){ /* no .env file — fine, defaults apply */ }

const PORT     = process.env.PORT || 8080;
const NREL_KEY = process.env.NREL_API_KEY || "DEMO_KEY"; // NREL's shared demo key works, rate-limited
const PUBLIC   = path.join(__dirname, "public");
const UA       = "OnSitePowerIntelligence/0.2 (behind-the-meter planning tool)";

/* ---- tiny in-memory cache (per-process, 1 hour) ---------------------------- */
const cache = new Map(), TTL = 60 * 60 * 1000;
const ckey  = (parts) => JSON.stringify(parts);
function cacheGet(k){ const e = cache.get(k); return (e && Date.now() - e.t < TTL) ? e.v : null; }
function cacheSet(k, v){ cache.set(k, { t: Date.now(), v: v }); return v; }

/* ---- helpers -------------------------------------------------------------- */
async function getJSON(url, opts){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error("upstream " + r.status + " from " + new URL(url).host);
  return r.json();
}
const round = (n, d) => {
  const f = Math.pow(10, d == null ? 3 : d);
  return Math.round(parseFloat(n) * f) / f;
};

/* ---- API routes ----------------------------------------------------------- *
 * Every handler takes URLSearchParams and returns a JSON-serializable object.
 * Throwing produces a graceful 502 with { error }. ------------------------- */
const api = {

  /* Geocoding & reverse-geocoding — OpenStreetMap Nominatim.
   * ?q=<place>            -> forward search  (returns Nominatim array)
   * ?lat=&lon=            -> reverse lookup  (returns Nominatim object)         */
  "/api/geo": async (q) => {
    if(q.get("q")){
      const term = q.get("q");
      const k = ckey(["geo-search", term]);
      const hit = cacheGet(k); if(hit) return hit;
      const u = "https://nominatim.openstreetmap.org/search?format=json"
              + "&accept-language=en&limit=1&q=" + encodeURIComponent(term);
      return cacheSet(k, await getJSON(u, { headers: { "User-Agent": UA } }));
    }
    const lat = round(q.get("lat")), lon = round(q.get("lon"));
    if(!isFinite(lat) || !isFinite(lon)) throw new Error("provide ?q= or ?lat=&lon=");
    const k = ckey(["geo-reverse", lat, lon]);
    const hit = cacheGet(k); if(hit) return hit;
    const u = "https://nominatim.openstreetmap.org/reverse?format=jsonv2"
            + "&addressdetails=1&accept-language=en&zoom=8&lat=" + lat + "&lon=" + lon;
    return cacheSet(k, await getJSON(u, { headers: { "User-Agent": UA } }));
  },

  /* Power infrastructure near a point — OpenStreetMap via the Overpass API.
   * Returns the raw Overpass payload { elements:[...] }; the frontend parses it.
   * Community-sourced: good for US transmission & substations, patchier for gas. */
  "/api/infra": async (q) => {
    const lat = round(q.get("lat"), 3), lon = round(q.get("lon"), 3);
    if(!isFinite(lat) || !isFinite(lon)) throw new Error("lat/lon required");
    const k = ckey(["infra", lat, lon]);
    const hit = cacheGet(k); if(hit) return hit;
    const d  = 0.10;                                   // ~10 km box around the site
    const bb = (lat-d) + "," + (lon-d) + "," + (lat+d) + "," + (lon+d);
    const query = "[out:json][timeout:25];("
      + 'way["power"="line"](' + bb + ');'
      + 'way["power"="substation"](' + bb + ');node["power"="substation"](' + bb + ');'
      + 'way["power"="plant"](' + bb + ');node["power"="plant"](' + bb + ');'
      + 'way["power"="generator"](' + bb + ');node["power"="generator"](' + bb + ');'
      + 'way["man_made"="pipeline"]["substance"~"gas",i](' + bb + ');'
      + ");out tags geom;";
    const data = await getJSON("https://overpass-api.de/api/interpreter", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body:    "data=" + encodeURIComponent(query)
    });
    return cacheSet(k, data);
  },

  /* Site-specific solar capacity factor — NREL PVWatts v8.
   * Lets the model replace the generic 0.24 default with a real site value.    */
  "/api/solar": async (q) => {
    const lat = round(q.get("lat")), lon = round(q.get("lon"));
    if(!isFinite(lat) || !isFinite(lon)) throw new Error("lat/lon required");
    const k = ckey(["solar", lat, lon]);
    const hit = cacheGet(k); if(hit) return hit;
    const u = "https://developer.nrel.gov/api/pvwatts/v8.json?api_key=" + NREL_KEY
            + "&lat=" + lat + "&lon=" + lon
            + "&system_capacity=1&azimuth=180&tilt=20&array_type=2&module_type=0&losses=14";
    const d = await getJSON(u);
    const o = d && d.outputs ? d.outputs : {};
    return cacheSet(k, {
      capacityFactor: typeof o.capacity_factor === "number" ? o.capacity_factor / 100 : null,
      acAnnualKwh:    typeof o.ac_annual === "number" ? o.ac_annual : null,
      source:         "NREL PVWatts v8 (1-axis tracking)"
    });
  }
};

/* ---- static file serving -------------------------------------------------- */
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon" };
function serveStatic(req, res){
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if(p === "/") p = "/index.html";
  const fp = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
  if(fp.indexOf(PUBLIC) !== 0){ res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(fp, (err, buf) => {
    if(err){ res.writeHead(404, { "Content-Type":"text/plain" }); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
}

/* ---- request handler ------------------------------------------------------ */
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if(url.pathname.indexOf("/api/") === 0){
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const handler = api[url.pathname];
    if(!handler){ res.writeHead(404); res.end(JSON.stringify({ error:"unknown endpoint" })); return; }
    try {
      const data = await handler(url.searchParams);
      res.writeHead(200); res.end(JSON.stringify(data));
    } catch(e){
      res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
    return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log("On-Site Power Intelligence  ·  http://localhost:" + PORT);
  console.log("NREL key: " + (process.env.NREL_API_KEY
    ? "custom key set"
    : "using shared DEMO_KEY (rate-limited — set NREL_API_KEY for real use)"));
});
