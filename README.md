# NBPDCL Enterprise Energy Accounting Dashboard

Enterprise-grade, Power BI-style energy accounting platform for **North Bihar Power
Distribution Company Limited (NBPDCL)** — built on a live Google Sheets data source.

> **Status: All 5 dashboards complete.**
> Power Purchase, Bihar UI Deviation, Input Energy (with DISCOM › Circle › Division ›
> Substation › Feeder drill-down), Railway Power, and Prosumer Sales are all fully
> implemented with dedicated backend analytics engines, live Google Sheets data,
> global filters, Plotly visual suites, executive AI insights, sortable/paginated
> detail tables, and CSV export. No placeholders, no mock data.

---

## 1. Architecture

```
Google Sheets → Google Apps Script → FastAPI Backend → React Frontend
```

- **Backend:** FastAPI, async httpx client to the Apps Script endpoint, in-memory TTL
  cache (60s), row cleaning/de-duplication, JWT auth, per-dashboard analytics engine.
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS + Plotly.js + React Query +
  Zustand + React Router.

See `docs/PROJECT_STRUCTURE.md` for the full folder layout.

## 2. Prerequisites

- Node.js 18+
- Python 3.10+
- The Google Apps Script Web App must be deployed with **"Anyone"** access so the
  backend server can reach it (see `backend/.env.example`).

## 3. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # edit if your Apps Script URL differs
uvicorn app.main:app --reload --port 8000
```

Verify: open `http://localhost:8000/api/v1/health` → `{"status":"ok"}`
Interactive API docs: `http://localhost:8000/docs`

## 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env            # VITE_API_URL=http://localhost:8000/api/v1
npm run dev
```

Open `http://localhost:5173`. Demo login: **admin / nbpdcl@2026**

## 5. Production Build

```bash
cd frontend
npm run build        # outputs to frontend/dist
npm run preview      # serve the production build locally
```

Backend production run:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

## 6. Docker (optional)

```bash
docker-compose up --build
```

Frontend → `http://localhost:5173`, Backend → `http://localhost:8000`.

## 7. Google Sheets Data Contract

Single Apps Script endpoint, differentiated by `?sheet=` query param. Never change the
sheet names below without also updating `backend/app/core/config.py`:

| Dashboard          | Sheet Name                  |
|---------------------|-----------------------------|
| Power Purchase      | `Plant_Purchase_Master`     |
| Bihar UI Deviation  | `master_ui_deviation_bihar` |
| Input Energy        | `input_energy`              |
| Railway Power       | `railway_power`             |
| Prosumer Sales      | `prosumer_energy_sales`     |

## 8. Troubleshooting

- **403 / connection error fetching sheet data:** confirm the Apps Script deployment's
  access is set to "Anyone", and that your server's network/firewall allows outbound
  HTTPS to `script.google.com`.
- **CORS errors in browser:** add your frontend origin to `CORS_ORIGINS` in
  `backend/.env`.
- **Stale data:** cache TTL is 60s; call `GET /api/v1/purchase/kpis` etc. again after
  that window, or restart the backend to clear the in-memory cache.

## 9. Dashboard Coverage

| Dashboard | Sheet | KPIs | Charts | Drill-down / Filters | Table |
|---|---|---|---|---|---|
| Power Purchase | `Plant_Purchase_Master` | 8 | 13 (donut, treemap, sunburst, sankey, bubble, top10, waterfall, heatmap, polar, trend) | Year/Quarter/Month/Plant Type/Name/Voltage/PPA | Paginated, sortable, CSV export |
| Bihar UI Deviation | `master_ui_deviation_bihar` | 4 | Dual trend, daily deviation bars, gauge, cumulative, calendar heatmap, histogram | Year/Quarter/Month/Date range | Paginated, sortable, CSV export |
| Input Energy | `input_energy` | 8 | Trend, DISCOM share, circle/division ranking, circle/division heatmap, treemap, sunburst, sankey, top/bottom feeders, bubble, scatter, pareto, waterfall, gauge | Full DISCOM›Circle›Division›Substation›Feeder cascading drill-down + search | Paginated, sortable, CSV export |
| Railway Power | `railway_power` (long format, pivoted server-side) | 6 | Schedule trend, schedule vs drawal, overdrawal, distribution, gauge, waterfall, sankey | Year/Quarter/Month/Metric | Paginated, sortable, CSV export |
| Prosumer Sales | `prosumer_energy_sales` | 6 | Trend, plant-type contribution, top10, voltage sales, type×voltage heatmap, treemap, bubble, monthly heatmap, waterfall, sankey | Year/Quarter/Month/Plant Type/Voltage/PPA/Plant/Search | Paginated, sortable, CSV export |

All charts use Plotly's native responsive resizing (`useResizeHandler`), rotated/abbreviated
axis labels for long category names, and horizontal bar orientation where category lists are
long (e.g. Circle/Division ranking) to prevent label overlap.

## 10. What's next (optional future work)

- AG Grid-based virtualization for tables beyond 5,000 rows (current pagination handles
  the full production data volume comfortably).
- Role-based access control and forgot/reset password flows.
- CI pipeline and automated frontend/backend test suite.
