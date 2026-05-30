# Deploy On-Site Power Intelligence

Public web deployment via **Render** (free tier) + **GitHub**.
End result: a shareable URL like `https://onsite-power-intelligence-XXXX.onrender.com`.

---

## What you'll get

- A public HTTPS URL anyone can open.
- Auto-deploy on every git push.
- Free hosting (the service spins down after 15 minutes of inactivity; first request after sleep takes ~30 seconds to wake — fine for a low-traffic demo).
- Optional custom domain (e.g. `power.yourdomain.com`).

---

## Prerequisites

- A GitHub account (you have one).
- A Render account (1-minute signup at https://render.com — sign in with GitHub for the smoothest experience).
- Terminal access on your computer to run `git`.

---

## Step 1 — Create the GitHub repository (2 minutes)

1. Open https://github.com/new in your browser.
2. **Repository name**: `onsite-power-intelligence` (any name works).
3. **Visibility**: Public *or* Private — both work on Render's free tier.
4. **Do NOT** check "Add a README", "Add .gitignore", or "Choose a license". We'll push our own files.
5. Click **Create repository**.
6. On the next page, copy the URL shown under "…or push an existing repository". It looks like `https://github.com/YOUR_USERNAME/onsite-power-intelligence.git`.

---

## Step 2 — Push the code to GitHub (3 minutes)

Open your computer's Terminal and run these commands, one at a time. Replace `YOUR_USERNAME` with your GitHub username.

```bash
cd ~/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app

git init
git add .
git commit -m "Initial deploy: On-Site Power Intelligence v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/onsite-power-intelligence.git
git push -u origin main
```

If `git push` asks for credentials, use your GitHub username and a **personal access token** (not your password). Create one at https://github.com/settings/tokens/new — scope `repo` is enough.

After the push completes, refresh your GitHub repo page. You should see all the files.

---

## Step 3 — Connect Render to the repo (2 minutes)

1. Go to https://dashboard.render.com/select-repo?type=blueprint
2. Click **Connect GitHub** if it's your first time. Authorize Render to read your repos.
3. Find `onsite-power-intelligence` in the list and click **Connect**.
4. Render detects the `render.yaml` file in the repo and shows the planned service.
5. Click **Apply** (or **Create New Resources**).

That's it for the configuration — `render.yaml` told Render everything (Node runtime, free plan, build/start commands, region).

---

## Step 4 — Wait for the first deploy (~3 minutes)

Watch the **Logs** tab. You'll see:

```
==> Cloning from https://github.com/...
==> Running build command: npm install
added 2 packages in 1s
==> Running start command: npm start
On-Site Power Intelligence  ·  http://localhost:10000
NREL key: using shared DEMO_KEY (rate-limited — set NREL_API_KEY for real use)
==> Your service is live 🎉
```

The public URL is shown at the top of the service page, something like:

```
https://onsite-power-intelligence-XXXX.onrender.com
```

Open it. You should see the landing page. Click **Launch the tool** to verify the workbench loads.

---

## Step 5 (optional) — Set a real NREL API key

The shared `DEMO_KEY` is rate-limited (~1,000 requests/hour, shared globally). For sustained use:

1. Get a free key at https://developer.nrel.gov/signup/ (instant — email + name only).
2. In your Render dashboard, open the service.
3. Go to **Environment** in the left sidebar.
4. Click **Add Environment Variable**.
   - **Key**: `NREL_API_KEY`
   - **Value**: paste your key
5. Click **Save Changes**. The service auto-redeploys in ~1 minute.

---

## Step 6 (optional) — Custom domain

1. In Render: service → **Settings** → **Custom Domain** → **Add Custom Domain**.
2. Enter your domain (e.g. `power.yourdomain.com`).
3. Render shows the DNS record to add. In your DNS provider, add a `CNAME` record pointing to the value Render gave you.
4. HTTPS certificate is auto-provisioned within minutes once DNS propagates.

---

## Updating the site later

Any change you make locally, just:

```bash
cd ~/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
git add .
git commit -m "Describe the change"
git push
```

Render detects the push and auto-redeploys in 2–3 minutes.

---

## Troubleshooting

**"Build failed: cannot find module 'adm-zip'"**
The `npm install` step failed. Check the Logs tab for the exact error. Usually a Node version mismatch — confirm `render.yaml` has `NODE_VERSION` set to 20 (or 18+).

**Public URL returns 502 / "service unavailable"**
The service may still be cold-starting (first request after sleep). Wait 30 seconds and refresh. If it persists, check Logs for crash messages.

**Map doesn't show real infrastructure layers**
The `/api/infra` endpoint hits the OpenStreetMap Overpass API. Overpass is occasionally slow or returns 504. Reload after a minute. The base map and the rest of the tool still work.

**Solar capacity factor stays at 0.24 default**
The `/api/solar` endpoint needs a working NREL key. The DEMO_KEY may be exhausted. Set your own `NREL_API_KEY` as in Step 5.

**"Address search unavailable"**
The `/api/geo` endpoint uses Nominatim (OpenStreetMap geocoder). Nominatim throttles aggressively; this happens occasionally. Pasting coordinates always works.

---

## What's NOT in this deploy

- The EIA-860 extraction scripts (`scripts/fetch-eia860-*.js`) are not run on the server. They're for one-off local extraction. The pre-extracted JSON in `data/` is committed and served as-is.
- The `.env` file is git-ignored, so any secrets you put there stay local. Use Render's Environment Variables for production secrets.
- No analytics, no tracking, no user data storage. Render's free tier serves the static files and runs the Node server, that's it.

---

## Cost summary

| Item | Cost |
|---|---|
| Render free web service | $0 |
| GitHub repo (public or private) | $0 |
| NREL API key | $0 |
| Nominatim / Overpass / OpenStreetMap | $0 (community-supported, please don't abuse) |
| Custom domain (optional) | ~$10/yr at any registrar |

**Total to go live: $0.**
