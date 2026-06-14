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

/* ---- bot detection (User-Agent based) -------------------------------------
   One source string used both as a JS RegExp and a Postgres ~* pattern, so the
   live ingest and the one-time backfill of old rows classify identically. */
const BOT_SQL = "(bot|crawl|spider|slurp|headless|phantom|python|curl|wget|libwww|okhttp|java/|go-http|node-fetch|axios|monitor|uptime|scan|probe|preview|facebookexternalhit|slackbot|whatsapp|telegram|discordbot|bingpreview|googlebot|bingbot|yandex|baidu|duckduck|ahrefs|semrush|mj12|petal|dataforseo|gptbot|claudebot|ccbot|bytespider|amazonbot|applebot|archive|lighthouse|pingdom|statuscake)";
const BOT_RE  = new RegExp(BOT_SQL, "i");
function isBot(ua){ return !ua || BOT_RE.test(ua); }
function clientIp(req){
  const xff = String((req.headers && req.headers["x-forwarded-for"]) || "");
  if(xff) return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "";
}
/* country from IP (best-effort, cached per IP). Free, no key, low volume. */
async function ipCountry(ip){
  if(!ip || ip === "127.0.0.1" || ip === "::1") return null;
  const k = ckey(["ipc", ip]);
  const hit = cacheGet(k); if(hit != null) return hit === "_" ? null : hit;
  try {
    const j = await getJSON("http://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,countryCode",
      { signal: AbortSignal.timeout(2500) });
    const cc = (j && j.status === "success" && /^[A-Z]{2}$/.test(j.countryCode)) ? j.countryCode : null;
    cacheSet(k, cc || "_"); return cc;
  } catch(_){ cacheSet(k, "_"); return null; }
}

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
      "CREATE INDEX IF NOT EXISTS feedback_ts_idx ON feedback (ts DESC);" +
      "CREATE TABLE IF NOT EXISTS sitechecks (" +
      "  id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now()," +
      "  lat double precision, lng double precision, verdict text, cat text, fastest text, feasible int, ua text);" +
      "CREATE INDEX IF NOT EXISTS sitechecks_ts_idx ON sitechecks (ts DESC);" +
      /* internal flag: marks operator/own-device traffic so the dashboard can
         separate it from real users (also patched onto existing tables). */
      "ALTER TABLE events     ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;" +
      "ALTER TABLE sitechecks ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;" +
      "ALTER TABLE feedback   ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;" +
      /* bot flag (from User-Agent) + visitor country (from IP) so we can tell
         real US humans apart from crawlers/scanners. */
      "ALTER TABLE events     ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;" +
      "ALTER TABLE sitechecks ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;" +
      "ALTER TABLE feedback   ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;" +
      "ALTER TABLE events     ADD COLUMN IF NOT EXISTS country text;" +
      /* backfill bot on rows already collected, by matching the stored UA */
      "UPDATE events     SET bot = true WHERE bot = false AND (ua IS NULL OR ua ~* '" + BOT_SQL + "');" +
      "UPDATE sitechecks SET bot = true WHERE bot = false AND (ua IS NULL OR ua ~* '" + BOT_SQL + "');" +
      "UPDATE feedback   SET bot = true WHERE bot = false AND (ua IS NULL OR ua ~* '" + BOT_SQL + "');" +
      /* corrections inbox: experts fix the decisive numbers. NEVER auto-applied to
         the live verdict — operator reviews and promotes by hand. */
      "CREATE TABLE IF NOT EXISTS corrections (" +
      "  id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now()," +
      "  lat double precision, lng double precision, market text, field text," +
      "  our_value text, their_value text, source text, who text," +
      "  status text NOT NULL DEFAULT 'new', ua text," +
      "  internal boolean NOT NULL DEFAULT false, bot boolean NOT NULL DEFAULT false);" +
      "CREATE INDEX IF NOT EXISTS corrections_ts_idx ON corrections (ts DESC);"
    ).then(() => console.log("Analytics: Postgres ready"))
     .catch((e) => console.log("Analytics: table init failed — " + (e && e.message)));
  } catch(e){
    console.log("Analytics: 'pg' not installed — run npm install. " + (e && e.message));
  }
}

/* in-memory fallback when there is no database (resets on restart) */
const memFeedback = [];
const memSitechecks = [];
let memSeq = 1;

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
    "INSERT INTO events (session,type,name,path,referrer,utm,ua,internal,country,bot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [row.session, row.type, row.name, row.path, row.referrer, row.utm, row.ua, row.internal === true, row.country || null, row.bot === true]
  );
}
/* true when the visitor's browser is in operator mode (?ops=1) */
function isInternal(ev){ return ev && (ev.internal === 1 || ev.internal === true || ev.internal === "1"); }
function aggregate(rows){
  const now = Date.now();
  const sset = new Set(), s24 = new Set(), s7 = new Set();
  const day = {}, sectionS = {}, actionS = {}, sourceS = {}, sess = {}, pageS = {};
  rows.forEach((e) => {
    const iso = (e.ts instanceof Date) ? e.ts.toISOString() : String(e.ts);
    sset.add(e.session);
    const t = new Date(iso).getTime();
    if(now - t < 864e5) s24.add(e.session);
    if(now - t < 7 * 864e5) s7.add(e.session);
    const d = iso.slice(0, 10);
    (day[d] = day[d] || new Set()).add(e.session);
    if(e.type === "pageview") (pageS[e.name] = pageS[e.name] || new Set()).add(e.session);
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
    by_day, sections: rank(sectionS), sources: rank(sourceS), pages: rank(pageS),
    actions: { coordinate_set: get(actionS, "coordinate_set"), computed: get(actionS, "computed"),
      word_download: get(actionS, "word_download"), copy_link: get(actionS, "copy_link"),
      compare_open: get(actionS, "compare_open"), new_site: get(actionS, "new_site") },
    actions_all: rank(actionS),
    recent
  };
}
/* scope: "external" (real human users, default) | "internal" (your own ?ops=1 traffic) | "all" */
function scopeClause(scope){
  if(scope === "internal") return " AND internal = true";
  if(scope === "all")      return "";
  return " AND internal = false AND bot = false"; // external — real humans only (no crawlers)
}
/* classify each SESSION into exactly ONE bucket (internal wins, then bot, else
   human) so the headline counts reconcile: real + mine + bot = total. */
function classifySessions(rows){
  const flags = {};
  rows.forEach((e) => { const f = flags[e.session] = flags[e.session] || { internal:false, bot:false, country:null };
    if(e.internal) f.internal = true; if(e.bot) f.bot = true; if(!f.country && e.country) f.country = e.country; });
  const classOf = {};
  Object.keys(flags).forEach((s) => { classOf[s] = flags[s].internal ? "internal" : (flags[s].bot ? "bot" : "human"); });
  return { flags, classOf };
}
async function adminStats(scope){
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const res = await pool.query(
    "SELECT ts, session, type, name, referrer, utm, internal, bot FROM events WHERE ts >= $1 ORDER BY ts DESC LIMIT 50000",
    [since]
  );
  const rows = res.rows;
  const { classOf } = classifySessions(rows);
  let human = 0, intl = 0, bots = 0;
  Object.keys(classOf).forEach((s) => { const c = classOf[s]; if(c === "internal") intl++; else if(c === "bot") bots++; else human++; });
  const want = scope === "internal" ? "internal" : (scope === "all" ? null : "human");
  const filtered = want ? rows.filter((e) => classOf[e.session] === want) : rows;
  const out = aggregate(filtered);
  out.split = { external: human, internal: intl, bot: bots, scope: scope || "external" };
  return out;
}
/* visit-source diagnostics: real humans vs bots, country breakdown, and raw
   UA/referrer of recent sessions so the operator can eyeball it. (14 days) */
async function visitSources(){
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const r = await pool.query(
    "SELECT ts, type, name, referrer, ua, country, bot, internal, session FROM events WHERE ts >= $1 ORDER BY ts DESC LIMIT 5000",
    [since]);
  const rows = r.rows;
  const { flags, classOf } = classifySessions(rows);
  let humans = 0, bots = 0, intl = 0; const cc = {};
  Object.keys(classOf).forEach((s) => {
    const c = classOf[s];
    if(c === "internal") intl++;
    else if(c === "bot") bots++;
    else { humans++; const co = flags[s].country || "??"; cc[co] = (cc[co] || 0) + 1; }
  });
  const by_country = Object.keys(cc).map((k) => ({ country: k, sessions: cc[k] })).sort((a, b) => b.sessions - a.sessions);
  const recent = rows.slice(0, 50).map((e) => ({
    ts: e.ts, type: e.type, name: e.name, country: e.country || null,
    bot: e.bot === true, internal: e.internal === true, klass: classOf[e.session],
    ua: String(e.ua || "").slice(0, 180), referrer: e.referrer || ""
  }));
  return { ok: true, humans, bots, internal: intl, by_country, recent };
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
            ua:       String(req.headers["user-agent"] || "").slice(0, 200),
            internal: isInternal(ev)
          };
          row.bot = isBot(row.ua);
          row.country = (row.bot || row.internal) ? null : await ipCountry(clientIp(req));
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
          internal: isInternal(ev),
          ts: new Date().toISOString()
        };
        row.bot = isBot(row.ua);
        if(pool){
          await pool.query(
            "INSERT INTO feedback (text,lat,lng,tier,verdict,ua,internal,bot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [row.text, row.lat, row.lng, row.tier, row.verdict, row.ua, row.internal, row.bot]
          );
        } else {
          row.id = "m" + (memSeq++);
          memFeedback.unshift(row);
          if(memFeedback.length > 500) memFeedback.pop();
        }
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
      } catch(e){ res.writeHead(200); res.end(JSON.stringify({ ok:true })); }
      return;
    }

    /* correction: an expert fixes a number (public). Stored in an inbox — NEVER
       auto-applied to the live verdict. The operator reviews and promotes by hand. */
    if(url.pathname === "/api/correction"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      try {
        const body = await readBody(req);
        let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
        const their = String(ev.their_value || "").trim().slice(0, 300);
        if(!their){ res.writeHead(400); res.end(JSON.stringify({ error:"empty" })); return; }
        const row = {
          lat: (typeof ev.lat === "number" && isFinite(ev.lat)) ? ev.lat : null,
          lng: (typeof ev.lng === "number" && isFinite(ev.lng)) ? ev.lng : null,
          market: String(ev.market || "").slice(0, 200),
          field: String(ev.field || "grid_year").slice(0, 40),
          our_value: String(ev.our_value || "").slice(0, 100),
          their_value: their,
          source: String(ev.source || "").slice(0, 500),
          who: String(ev.who || "").slice(0, 200),
          ua: String(req.headers["user-agent"] || "").slice(0, 200),
          internal: isInternal(ev)
        };
        row.bot = isBot(row.ua);
        if(pool){
          await pool.query(
            "INSERT INTO corrections (lat,lng,market,field,our_value,their_value,source,who,ua,internal,bot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [row.lat, row.lng, row.market, row.field, row.our_value, row.their_value, row.source, row.who, row.ua, row.internal, row.bot]
          );
        }
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
      } catch(e){ res.writeHead(200); res.end(JSON.stringify({ ok:true })); }
      return;
    }

    /* sitecheck: log one screening run (public, best-effort) */
    if(url.pathname === "/api/sitecheck"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      try {
        const body = await readBody(req);
        let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
        const row = {
          lat: (typeof ev.lat === "number" && isFinite(ev.lat)) ? ev.lat : null,
          lng: (typeof ev.lng === "number" && isFinite(ev.lng)) ? ev.lng : null,
          verdict: String(ev.verdict || "").slice(0, 200),
          cat: String(ev.cat || "").slice(0, 40),
          fastest: String(ev.fastest || "").slice(0, 120),
          feasible: (typeof ev.feasible === "number" && isFinite(ev.feasible)) ? Math.round(ev.feasible) : null,
          ua: String(req.headers["user-agent"] || "").slice(0, 200),
          internal: isInternal(ev),
          ts: new Date().toISOString()
        };
        row.bot = isBot(row.ua);
        if(pool){
          await pool.query(
            "INSERT INTO sitechecks (lat,lng,verdict,cat,fastest,feasible,ua,internal,bot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [row.lat, row.lng, row.verdict, row.cat, row.fastest, row.feasible, row.ua, row.internal, row.bot]
          );
        } else {
          memSitechecks.unshift(row);
          if(memSitechecks.length > 1000) memSitechecks.pop();
        }
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
      } catch(e){ res.writeHead(200); res.end(JSON.stringify({ ok:true })); }
      return;
    }

    /* sitecheck: operator reads recent screening runs (key-gated when ADMIN_KEY is set) */
    if(url.pathname === "/api/admin/sitechecks"){
      if(ADMIN_KEY && url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      try {
        if(pool){
          const scope = url.searchParams.get("scope") || "external";
          const r = await pool.query("SELECT ts,lat,lng,verdict,cat,fastest,feasible,internal FROM sitechecks WHERE 1=1" + scopeClause(scope) + " ORDER BY ts DESC LIMIT 500");
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: r.rows }));
        } else {
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: memSitechecks, note:"in-memory (no DATABASE_URL) — resets on restart" }));
        }
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* feedback: operator reads the inbox (key-gated when ADMIN_KEY is set) */
    if(url.pathname === "/api/admin/feedback"){
      if(ADMIN_KEY && url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      try {
        if(pool){
          const scope = url.searchParams.get("scope") || "external";
          const r = await pool.query("SELECT id,ts,text,lat,lng,tier,verdict,internal FROM feedback WHERE 1=1" + scopeClause(scope) + " ORDER BY ts DESC LIMIT 500");
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: r.rows }));
        } else {
          res.writeHead(200); res.end(JSON.stringify({ ok:true, items: memFeedback, note:"in-memory (no DATABASE_URL) — resets on restart" }));
        }
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* feedback: operator deletes one note (key-gated) */
    if(url.pathname === "/api/admin/feedback/delete"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      if(ADMIN_KEY && url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      try {
        const body = await readBody(req);
        let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
        const id = ev.id;
        if(id === undefined || id === null || id === ""){ res.writeHead(400); res.end(JSON.stringify({ error:"id required" })); return; }
        if(pool){
          await pool.query("DELETE FROM feedback WHERE id = $1", [id]);
        } else {
          for(let i = memFeedback.length - 1; i >= 0; i--){ if(String(memFeedback[i].id) === String(id)) memFeedback.splice(i, 1); }
        }
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* corrections: operator reads the inbox (key-gated) */
    if(url.pathname === "/api/admin/corrections"){
      if(!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      if(!pool){ res.writeHead(200); res.end(JSON.stringify({ ok:true, items: [] })); return; }
      try {
        const r = await pool.query("SELECT id,ts,lat,lng,market,field,our_value,their_value,source,who,status,internal,bot FROM corrections ORDER BY ts DESC LIMIT 500");
        res.writeHead(200); res.end(JSON.stringify({ ok:true, items: r.rows }));
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* corrections: operator sets a status (new | reviewed | applied | dismissed) — key-gated */
    if(url.pathname === "/api/admin/corrections/status"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      if(!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      try {
        const body = await readBody(req);
        let ev = {}; try { ev = JSON.parse(body || "{}"); } catch(_){}
        const id = ev.id, status = String(ev.status || "").trim();
        if(id == null || id === "" || ["new","reviewed","applied","dismissed"].indexOf(status) < 0){
          res.writeHead(400); res.end(JSON.stringify({ error:"id + valid status required" })); return;
        }
        if(pool) await pool.query("UPDATE corrections SET status = $1 WHERE id = $2", [status, id]);
        res.writeHead(200); res.end(JSON.stringify({ ok:true }));
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
        const scope = url.searchParams.get("scope") || "external";
        const stats = await adminStats(scope);
        res.writeHead(200); res.end(JSON.stringify(stats));
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* visit-source diagnostics: real humans vs bots, country, raw UA (key-gated) */
    if(url.pathname === "/api/admin/sources"){
      if(!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      if(!pool){ res.writeHead(200); res.end(JSON.stringify({ ok:false, error:"Database not configured" })); return; }
      try {
        const data = await visitSources();
        res.writeHead(200); res.end(JSON.stringify(data));
      } catch(e){ res.writeHead(502); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
      return;
    }

    /* analytics: wipe stored data (key-gated, destructive).
       ?scope=all      -> clear everything (events + sitechecks + feedback)
       ?scope=internal -> clear only your own ?ops=1 traffic, keep real users */
    if(url.pathname === "/api/admin/reset"){
      if(req.method !== "POST"){ res.writeHead(405); res.end(JSON.stringify({ error:"POST only" })); return; }
      if(!ADMIN_KEY || url.searchParams.get("key") !== ADMIN_KEY){
        res.writeHead(401); res.end(JSON.stringify({ error:"unauthorized" })); return;
      }
      if(!pool){ res.writeHead(200); res.end(JSON.stringify({ ok:false, error:"Database not configured" })); return; }
      try {
        const scope = url.searchParams.get("scope") || "all";
        if(scope === "internal"){
          const a = await pool.query("DELETE FROM events WHERE internal = true");
          const b = await pool.query("DELETE FROM sitechecks WHERE internal = true");
          const c = await pool.query("DELETE FROM feedback WHERE internal = true");
          res.writeHead(200); res.end(JSON.stringify({ ok:true, scope:"internal", deleted:{ events:a.rowCount, sitechecks:b.rowCount, feedback:c.rowCount } }));
        } else {
          await pool.query("TRUNCATE events, sitechecks, feedback RESTART IDENTITY");
          res.writeHead(200); res.end(JSON.stringify({ ok:true, scope:"all", truncated:true }));
        }
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
