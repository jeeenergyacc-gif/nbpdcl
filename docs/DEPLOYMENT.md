# Deploying the NBPDCL Enterprise Dashboard

## The recommendation (read this first)

For this specific app — an internal reporting tool, several users a day,
CPU-heavy booklet generation, and **no database to host** (the data lives in your
Google Sheet) — the best setup is:

> **Frontend on Cloudflare Pages (free) · Backend on Render · GitHub Actions keep-alive**

Two honest notes on the backend tier:

- **If any budget at all:** Render **Starter ($7/mo)** for the backend is the
  genuinely best choice. It removes sleep and gives real CPU, so full-detail
  booklets are smooth and no keep-alive is needed. For a government tool people
  open daily, $7 is usually the right call.
- **If it must be free:** Render **free** backend works, with two accommodations
  already built in — the keep-alive ping (Step 7) hides the cold start, and the
  booklet defaults to summary mode (Step 8) so the 0.1-CPU limit isn't a problem.

Why Cloudflare Pages over Vercel for the frontend here: this is a plain Vite SPA
with no SSR or serverless functions, so Vercel's headline advantages don't apply,
and Cloudflare's free tier is cleaner for organizational/commercial use. Both are
free and never sleep; either works, Cloudflare is the tidier fit.

Why the frontend and backend split across two hosts: the frontend is static and
belongs on a CDN that never sleeps; the backend is a long-running Python process
with CPU-bound booklet rendering that does **not** fit a serverless model. Keep
them separate.

The rest of this document walks the free path step by step. The `render.yaml`
blueprint can also deploy the frontend on Render if you'd rather keep everything
in one place — see the note at Step 2.

---

## What you'll end up with

```
  Browser ──► Cloudflare Pages   (static site, free, always on, global CDN)
                    │  VITE_API_URL
                    ▼
              nbpdcl-api          (FastAPI on Render — free sleeps, Starter doesn't)
                    │  GOOGLE_SCRIPT_URL
                    ▼
              Google Apps Script ──► your Google Sheets   (already hosted, free)
```

Two known free-tier costs, both handled below:
- The API cold-starts (~40-60 s) after 15 min idle → the keep-alive ping fixes it
  during office hours.
- The API has 0.1 CPU / 512 MB → keep the booklet's "feeder detail" off for the
  routine case (Step 8).

---

## Before you start

- The repo is on GitHub (private is fine).
- You can sign in to Render with that GitHub account.
- You have your Google Apps Script `/exec` URL (the one in `backend/.env.example`).

---

## Step 1 — Push to GitHub

If it isn't already:

```bash
cd nbpdcl
git init
git add .
git commit -m "NBPDCL dashboard + booklet automation"
git branch -M main
git remote add origin https://github.com/<you>/nbpdcl.git
git push -u origin main
```

Confirm `render.yaml` sits at the repo root and `backend/` and `frontend/` are
one level down. The blueprint's `rootDir` values depend on that layout.

---

## Step 2 — Create the backend from the blueprint

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo.
3. Render reads `render.yaml` and shows two services: **nbpdcl-api** (web) and
   **nbpdcl-dashboard** (static).
4. Click **Apply**.

You can ignore or delete the **nbpdcl-dashboard** static service — we're putting
the frontend on Cloudflare Pages instead (Step 4). If you'd rather keep
everything on Render, leave it and it deploys the frontend too; just apply the
`VITE_API_URL` / CORS wiring to it exactly as described for Cloudflare below.

The first backend build starts. It finishes but the app won't fully work until
the URLs are wired in the next steps — that's expected.

---

## Step 3 — Set the backend secrets

Open **nbpdcl-api** → **Environment**. `JWT_SECRET` is already generated for you.
Set the three marked `sync: false`:

| Variable | Value |
|---|---|
| `DEMO_USERNAME` | your login user (e.g. `admin`) |
| `DEMO_PASSWORD` | a real password — **change it from the repo default** |
| `GOOGLE_SCRIPT_URL` | your Apps Script `/exec` URL |

Leave `CORS_ORIGINS` for Step 5 (you don't have the frontend URL yet).

---

## Step 4 — Deploy the frontend on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect
   to Git** → pick the repo.
2. Build settings:
   - **Framework preset:** Vite (or None)
   - **Root directory:** `frontend`
   - **Build command:** `npm ci && npm run build`
   - **Build output directory:** `dist`
3. Under **Environment variables**, add
   `VITE_API_URL = https://nbpdcl-api.onrender.com/api/v1`
   (your backend URL + `/api/v1` — the suffix is required; it's baked in at build
   time, so changing it later needs a rebuild).
4. **Save and Deploy.**

SPA deep links are handled by `frontend/public/_redirects` (already in the repo —
`/* /index.html 200`), which Vite copies into `dist/`. No extra config needed.

`npm ci` (not `install`) keeps TypeScript pinned at 5.9.3 — 6.0.3 breaks the
build on the `baseUrl` setting.

---

## Step 5 — Open CORS to the frontend

1. Copy the frontend URL from Cloudflare Pages, e.g.
   `https://nbpdcl-dashboard.pages.dev` (or your custom domain).
2. **nbpdcl-api** → **Environment** → set:

   ```
   CORS_ORIGINS = https://nbpdcl-dashboard.pages.dev
   ```

   No trailing slash. Multiple origins are comma-separated. Until this is set the
   browser's calls are blocked by CORS — that's the backend doing its job, not a
   bug.
3. Render restarts the API automatically on an env change.

---

## Step 6 — Smoke test

```bash
# backend up?
curl https://nbpdcl-api.onrender.com/api/v1/health
# -> {"status":"ok",...}

# login works?
curl -X POST https://nbpdcl-api.onrender.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<your DEMO_PASSWORD>"}'
# -> {"access_token":"...."}

# booklet month list (data-driven; shows only months with purchase energy)
curl https://nbpdcl-api.onrender.com/api/v1/booklet/periods
```

Then open the frontend URL in a browser and log in. The **first** request may
take ~40-60 s if the API had gone to sleep — that's the cold start, handled next.

---

## Step 7 — Turn on the keep-alive

`.github/workflows/keep-alive.yml` is already in the repo. Give it the URL:

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New
   repository secret**.
2. Name `API_HEALTH_URL`, value
   `https://nbpdcl-api.onrender.com/api/v1/health`.
3. **Actions** tab → **keep-alive** → **Run workflow** to test it once.

It pings every 10 minutes, 09:00-19:00 IST, Mon-Sat — enough to keep the service
warm in working hours without burning the 750 free instance-hours/month that
24×7 would. Adjust the `cron` line if your hours differ (it's in UTC).

---

## Step 8 — Tune the booklet for 0.1 CPU

The free API has 0.1 CPU / 512 MB. A summary booklet renders fine; a full
feeder-level one (thousands of rows) is slow there and can brush the request
timeout. Two options:

- **Routine use:** on the Reports page, **"Include feeder-level Section 9" is now
  off by default**, so the summary booklet — quick even on free — is what you get
  unless you deliberately ask for more.
- **Full detail occasionally:** tick it and accept a longer wait, or generate it
  once a month on a paid instance (below).

The rendering already runs off the event loop (`run_in_threadpool`), so a slow
booklet never freezes the dashboards for other users — verified: a health probe
answers in ~5 ms even while five booklets generate.

---

## If free isn't enough

The one upgrade that removes every rough edge is the backend on Render
**Starter ($7/mo)**: no sleep, real CPU, full-detail booklets are smooth, and the
keep-alive becomes unnecessary. The frontend stays free. For a government tool
several people open daily, that's usually the right trade — but the free path
above is fully functional.

---

## Alternative: frontend on Cloudflare Pages / Vercel

If you'd rather host the static frontend on Cloudflare Pages or Vercel (both free,
never sleep) and keep only the backend on Render:

- Build command `npm ci && npm run build`, output directory `dist`,
  root directory `frontend`.
- Set `VITE_API_URL` to the Render backend `.../api/v1`.
- Add that Pages/Vercel URL to the backend's `CORS_ORIGINS`.
- Add an SPA rewrite (all paths → `/index.html`).

Then the Render static service in `render.yaml` is redundant — delete that block
or just ignore it.

---

## Data note

This is BSPHCL/NBPDCL operational data. The Google Sheet already sits in Google's
(US) cloud, and Render hosts outside India too. If your department has a
data-residency or approval requirement, clear the hosting choice with IT before
go-live — it's a policy decision, not a technical one. JWT auth is in place, and
you can add a custom domain plus restrict access at the edge if needed.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login page loads, everything else fails | `CORS_ORIGINS` missing the frontend URL | Step 5, exact URL, no trailing slash |
| Frontend calls `localhost:8000` | `VITE_API_URL` unset or set after build | Step 4, then **rebuild** the frontend |
| First load takes ~1 min | Free-tier cold start | Step 7 keep-alive, or Starter plan |
| Booklet times out | Full feeder detail on 0.1 CPU | Step 8 — summary mode, or paid instance |
| Year dropdown missing 2026 | No FY 2026-27 purchase rows in the sheet yet | Not a deploy issue — add May 2026+ purchase data |
| All users logged out after a deploy | `JWT_SECRET` not persistent | Blueprint sets `generateValue: true`; keep it |
