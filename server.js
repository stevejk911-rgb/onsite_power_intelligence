"use strict";
/* =============================================================================
 * On-Site Power Intelligence — backend
 * -----------------------------------------------------------------------------
 * Node 18+ (built-in fetch). Serves the frontend and proxies open-data APIs so
 * the browser never calls them directly (CORS, User-Agent, hidden key, cache).
 *
 * Run:  node server.js   then open http://localhost:8080
 *
 * Operator analytics: /api/track (ingest) + /api/admin/stats (read) persist to a
 * Postgres database (e.g. Railway Postgres) via the `pg` driver. Configure with:
 *   DATABASE_URL  (Postgres connection string, use the PUBLIC url from Railway)
 *   ADMIN_KEY     (password to open /admin.html)
 * If DATABASE_URL is unset, tracking silently no-ops and the site works unchanged.
 * The events table is auto-created on first start.
 *
 * Visitor feedback: /api/feedback (POST, public) stores one-line notes; the
 * operator reads them at /api/admin/feedback (key-gated). Persists to Postgres
 * when DATABASE_URL is set, otherwise falls back to an in-memory list that
 * survives only while the process is running.
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

/* ---- analytics config + Postgres pool ------------------------------------- */
const DATABASE_URL = process.env.DATABASE_URL || "";
const ADMIN_KEY    = process.env.ADMIN_KEY || "";
let pool = null;
if(DATABASE_URL){
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
    pool.on("error", () => {}); // never crash the process on an idle client error
    pool.query(
      "CREATE TABLE IF NOT EXISTS events (" +
      "  id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now()," +
      "  session text, type text, name text, path text, referrer text, utm text, ua text);" +
      "CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts DESC);" +
      "CREATE TABLE IF NOT EXISTS feedback (" +
      "  id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now()," +
      "  text text, lat double precision, lng double precision, tier text, verdict text, ua text);" +
      "CREATE INDEX IF NOT EXISTS feedback_ts_idx ON feedback (ts DESC);"
    ).then(() => console.log("Analytics: Postgres ready"))
     .catch((e) => console.log("Analytics: table init failed — " + (e && e.message)));
  } catch(e){
    console.log("Analytics: 'pg' not installed — run npm install. " + (e && e.message));
  }
}

/* in-memory feedback fallback when there is no database (resets on restart) */
const memFeedback = [];

/* ---- tiny in-memory cache (per-process, 1 hour) ---------------------------- */
const cache = new Map(), TTL = 60 * 60 * 1000;
const ckey = (parts) => JSON.stringify(parts);
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

/* ---- analytics helpers ---------------------------------------------------- */
function readBody(req){
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; if(b.length > 1e5) req.destroy(); });
    req.on("end", () => resolve(b));
    req.on("error",() => resolve(""));
  });
}
async function dbInsert(row){
  await pool.query(
    "INSERT INTO events (session,type,name,path,referrer,utm,ua) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [row.session, row.type, row.name, row.path, row.referrer, row.utm, row.ua]
  );
}
async function adminStats(){
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const res = await pool.query(
    "SELECT ts, session, type, name, referrer, utm FROM events WHERE ts >= $1 ORDER BY ts DESC LIMIT 50000",
    [since]
  );
  const rows = res.rows;
  const now = Date.now();
  const sset = new Set(), s24 = new Set(), s7 = new Set();
  const day = {}, sectionS = {}, actionS = {}, sourceS = {}, sess = {};
  rows.forEach((e) => {
    const iso = (e.ts instanceof Date) ? e.ts.toISOString() : String(e.ts);
    sset.add(e.session);
    const t = new Date(iso).getTime();
    if(now - t < 864e5) s24.add(e.session);
    if(now - t < 7 * 864e5) s7.add(e.session);
    const d = iso.slice(0, 10);
    (day[d] = day[d] || new Set()).add(e.session);
    if(e.type === "section") (sectionS[e.name] = sectionS[e.name] || new Set()).add(e.session);
    if(e.type === "action") (actionS[e.name] = actionS[e.name] || new Set()).add(e.session);
    let src = e.utm || "";
    if(!src){ if(e.referrer){ try { src = new URL(e.referrer).hostname.replace(/^www\./, ""); } catch(_){ src = "other"; } } else src = "direct"; }
    (sourceS[src] = sourceS[src] || new Set()).add(e.session);
    const ss = sess[e.session] = sess[e.session] ||
      { session: e.session, first: iso, last: iso, events: 0, referrer: e.referrer || "", utm: e.utm || "", last_action: "" };
    ss.events++;
    if(iso < ss.first) ss.first = iso;
    if(iso > ss.last) ss.last = iso;
    if(e.type === "action") ss.last_action = e.name;
  });
  const pv = rows.filter((e) => e.type === "pageview").length;
  const by_day = [];
  for(let i = 13; i >= 0; i--){ const d = new Date(now - i * 864e5).toISOString().slice(0, 10); by_day.push({ day: d, sessions: (day[d] ? day[d].size : 0) }); }
  const rank = (obj) => Object.keys(obj).map((k) => ({ name: k, sessions: obj[k].size })).sort((a, b) => b.sessions - a.sessions);
  const get = (o, k) => (o[k] ? o[k].size : 0);
  const recent = Object.keys(sess).map((k) => sess[k]).sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 30);
  return {
    ok: true,
    totals: { sessions: sset.size, pageviews: pv, sessions_24h: s24.size, sessions_7d: s7.size },
    by_day, sections: rank(sectionS), sources: rank(sourceS),
    actions: { coordinate_set: get(actionS, "coordinate_set"), computed: get(actionS, "computed"),
      word_download: get(actionS, "word_download"), compare_open: get(actionS, "compare_open"),
      new_site: get(actionS, "new_site") },
    recent
  };
}

/* ---- API routes ----------------------------------------------------------- */
const api = {
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
  "/api/infra": async (q) => {
    const lat = round(q.get("lat"), 3), lon = round(q.get("lon"), 3);
    if(!isFinite(lat) || !isFinite(lon)) throw new Error("lat/lon required");
    const k = ckey(["infra", lat, lon]);
    const hit = cacheGet(k); if(hit) return hit;
    const d = 0.10;
    const bb = (lat-d) + "," + (lon-d) + "," + (lat+d) + "," + (lon+d);
    const query = "[out:json][timeout:25];("
      + 'way["power"="line"](' + bb + ');'
      + 'way["power"="substation"](' + bb + ');node["power"="substation"](' + bb + ');'
      + 'way["power"="plant"](' + bb + ');node["power"="plant"](' + bb + ');'
      + 'way["power"="generator"](' + bb + ');node["power"="generator"](' + bb + ');'
      + 'way["man_made"="pipeline"]["substance"~"gas",i](' + bb + ');'
      + ");out tags geom;";
    const data = await getJSON("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(query)
    });
    return cacheSet(k, data);
  },
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
      acAnnualKwh: typeof o.ac_annual === "number" ? o.ac_annual : null,
      source: "NREL PVWatts v8 (1-axis tracking)"
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

    /* analytics: ingest one event (best-effort; never breaks the site) */
    if(url.pathname === "/api/track"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      try {
        if(pool){
          const body = await readBody(req);
          let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
          const row = {
            session:  String(ev.session  || "").slice(0, 64),
            type:     String(ev.type     || "").slice(0, 24),
            name:     String(ev.name     || "").slice(0, 120),
            path:     String(ev.path     || "").slice(0, 200),
            referrer: String(ev.referrer || "").slice(0, 300),
            utm:      String(ev.utm      || "").slice(0, 160),
            ua:       String(req.headers["user-agent"] || "").slice(0, 200)
          };
          if(row.session && row.type) await dbInsert(row);
        }
        res.writeHead(204); res.end();
      } catch(e){ res.writeHead(204); res.end(); }
      return;
    }

    /* feedback: visitor leaves a one-line note (public, best-effort) */
    if(url.pathname === "/api/feedback"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      try {
        const body = await readBody(req);
        let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
        const text = String(ev.text || "").trim().slice(0, 2000);
        if(!text){ res.writeHead(400); res.end(JSON.stringify({ error:"empty" })); return; }
        const row = {
          text: text,
          lat: (typeof ev.lat === "number" && isFinite(ev.lat)) ? ev.lat : null,
          lng: (typeof ev.lng === "number" && isFinite(ev.lng)) ? ev.lng : null,
          tier: String(ev.tier || "").slice(0, 40),
          verdict: String(ev.verdict || "").slice(0, 200),
          ua: String(req.headers["user-agent"] || "").slice(0, 200),
          ts: new Date().toISOString()
        };
        if(pool){
          await pool.query(
            "INSERT INTO feedback (text,lat,lng,tier,verdict,ua) VALUES ($1,$2,$3,$4,$5,$6)",
            [row.text, row.lat, row.lng, row.tier, row.verdict, row.ua]
          );
        } else {
          memFeedback.unshift(row);
          if(memFeedback.length > 500) memFeedback.pop();
        }
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
      } catch(e){ res.writeHead(200); res.end(JSON.stringify({ ok:true })); }
      return;
    }

    /* feedback: operator reads the inbox (key-gated when ADMIN_KEY is set) */
    if(url.pathname === "/api/admin/feedback"){
      if(ADMIN_KEY && url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      try {
        if(pool){
          const r = await pool.query("SELECT ts,text,lat,lng,tier,verdict FROM feedback ORDER BY ts DESC LIMIT 500");
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: r.rows }));
        } else {
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: memFeedback, note:"in-memory (no DATABASE_URL) — resets on restart" }));
        }
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* analytics: aggregated stats for the operator dashboard (key-gated) */
    if(url.pathname === "/api/admin/stats"){
      if(!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      if(!pool){
        res.writeHead(200); res.end(JSON.stringify({ ok:false, error:"Database not configured" })); return;
      }
      try {
        const stats = await adminStats();
        res.writeHead(200); res.end(JSON.stringify(stats));
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

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
  console.log("On-Site Power Intelligence · http://localhost:" + PORT);
  console.log("NREL key: " + (process.env.NREL_API_KEY ? "custom key set" : "using shared DEMO_KEY"));
  console.log("Analytics: " + (DATABASE_URL ? "DATABASE_URL set" : "OFF (set DATABASE_URL + ADMIN_KEY)"));
});
