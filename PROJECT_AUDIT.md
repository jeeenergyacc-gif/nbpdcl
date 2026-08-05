# NBPDCL Enterprise Dashboard — Complete Project Audit

**Date:** 12 July 2026
**Scope:** Full stack — FastAPI backend, React/TS frontend, Google Sheets data layer, auth, build health.
**Verification method:** every claim below was checked by running the code (`compileall`, `tsc -b`, `vite build`) or by querying the actual sheet data. Nothing here is inferred from reading alone.

---

## 1. Health summary

| Area | Status |
|---|---|
| Backend compiles (`compileall`) | ✅ Pass — all 11 modules |
| Frontend typecheck (`tsc -b`) | ✅ Pass — exit 0, zero type errors |
| Production build (`vite build`) | ✅ Pass — 1m 37s |
| Backend↔sheet field contract | ✅ All field reads resolve to real columns |
| Data integrity | ✅ Clean (after the deviation fix, below) |
| Dead code | ⚠️ Significant — see §4 |
| Security posture | ⚠️ Three items to fix before production — see §5 |
| **Regression found** | 🔴 **Prosumer detail table is missing** — see §3 |

**Codebase:** 8,398 lines across 68 source files (11 backend modules, 57 frontend).

---

## 2. Bugs fixed during this engagement

These were real defects producing wrong numbers on screen. All are fixed and verified.

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | **Deviation: 497 placeholder rows** — the sheet pre-fills future dates with blanks/zeros. `rows[-1]` was an empty row. | Every deviation KPI read **0 MU**. Heatmap rendered as one solid block; cumulative line ran flat to 2027; histogram's zero-bin was flooded; "best day" reported a non-day. | `_has_measurement()` filter in `get_raw_data()`. KPIs now read 156.973 / 156.681 / +0.292 MU. |
| 2 | **Railway: metric name typo** — backend constant was `railway_overdraw`, the sheet says `railway_overdrawal`. It matched **zero rows**. | Railway overdrawal reported **0.00 MU** everywhere (KPI, gauge, waterfall, insights). Actual value: **76.966 MU**. | Alias tuple accepts both spellings. |
| 3 | **Purchase: waterfall was a placeholder** — `saleEnergy = 0, uiEnergy = 0` hardcoded. | Waterfall showed a flat, meaningless chart. | Wired to real additive KPI fields: Gross 4,659.24 → Sale −389.85 → UI −18.72 → Net 4,250.67. |
| 4 | **Purchase: Central/Intra from wrong column** — derived from `voltage_level` via `/polar`. | Both KPI cards permanently showed "—". | Re-derived from `ppa_type` (the correct rule): Central 4,303.55 (92.7%) / Intra 336.97 (7.3%). |
| 5 | **Purchase: "Sugar" plant type unmapped** | A real plant type rendered as grey "Unknown". | Added to `PLANT_TYPE_ORDER` + colour map. |
| 6 | **Lollipop: labels invisible** — a `custom` ECharts series silently ignores the series-level `label` config. | Top-10 plant values never rendered. | Labels drawn inside `renderItem`. |

---

## 3. 🔴 Open regression — fix this first

**The Prosumer dashboard lost its detail table.** During the layout rebuild the `useProsumerTable` hook stopped being called, so the paginated feeder/plant table that existed in the original (visible in `UI_PROSUMER_SALES.pdf`, page 5 — 82 records, CSV export) is no longer rendered.

- **Backend is fine:** `/prosumer/table` still works and is still exported from `prosumerApi.ts`.
- **Fix:** re-add a `<DataTable>` block to `ProsumerDashboard.tsx` (the other four dashboards all have one).
- **Effort:** ~15 lines.

---

## 4. Dead code (safe to delete; nothing imports it)

Left over from the dashboard redesigns. None of it is reachable — it inflates the bundle and misleads the next reader.

**Orphaned components (0 importers):**
- `components/charts/EnergySunburstChart.tsx`
- `components/purchase/SunburstSection.tsx` *(removed from the dashboard on request; file still present)*

**Dead API hooks (defined, never called by any page):**
- `inputEnergyApi.ts` — 12 hooks: `DiscomShare`, `DivisionRanking`, `DivisionHeatmap`, `Sunburst`, `Sankey`, `TopFeeders`, `BottomFeeders`, `Bubble`, `Scatter`, `Pareto`, `Waterfall`, `Gauge`
- `railwayApi.ts` — 10 hooks: `Kpis`, `ScheduleTrend`, `ScheduleVsDrawal`, `Overdrawal`, `Distribution`, `Gauge`, `Waterfall`, `Sankey`, `Insights`, `Table`
- `prosumerApi.ts` — 5 hooks: `Top10`, `Bubble`, `MonthlyHeatmap`, `Waterfall`, **`Table`** ← *this one is the regression above, not dead code*
- `purchaseApi.ts` — 3 hooks: `Trend`, `Waterfall`, `Insights`

⚠️ **Do not delete the matching backend endpoints.** The Reports page and any future exports may still want them, and removing endpoints is a contract break. The dead code here is the *frontend* hooks, not the API.

---

## 5. Security — must address before production

| # | Issue | Where | Risk |
|---|---|---|---|
| 1 | **JWT secret has a hardcoded default** — `"nbpdcl-enterprise-secret-change-in-production"` | `core/config.py:37` | If `JWT_SECRET` isn't set in the environment, anyone who reads this repo can forge a valid token for any user. **Set it in the environment and remove the default.** |
| 2 | **Credentials are a single hardcoded pair** — `DEMO_USERNAME=admin`, `DEMO_PASSWORD=nbpdcl@2026` | `core/config.py:41-42` | There is one shared account, no per-user identity, no password hashing, no lockout. Fine for a demo; not fine for a government utility handling real energy accounting. Needs a real user store. |
| 3 | **The login CAPTCHA is client-side only** | `pages/LoginPage.tsx` | The expected answer lives in the browser, so it stops nothing automated. It's UI friction, not security. If bot protection is actually needed, the challenge must be issued and verified server-side. |
| 4 | **Role and Financial Year are not enforced** | `LoginPage.tsx` → `localStorage` | The role dropdown is captured for session context only — the backend never sees it and grants no different permissions. If role-based access is a requirement, it must be implemented server-side; today the UI implies an authorisation boundary that doesn't exist. |

CORS is correctly restricted to configured origins (`localhost:5173`, `:3000`) — remember to add the production origin.

---

## 6. Performance

**Bundle: 7.1 MB raw / ~2.2 MB gzipped.**

| Chunk | Raw | Gzip |
|---|---|---|
| `plotly` | **4,751 kB** | 1,433 kB |
| `index` | 1,223 kB | 396 kB |
| `three` | 1,054 kB | 293 kB |
| others | ~145 kB | ~48 kB |

**Plotly alone is 67% of the bundle.** Two options, in order of value:

1. **Lazy-load the dashboards** (`React.lazy` + `Suspense` per route). Plotly and Three then only download when a user actually opens a chart page — the login page currently pays for both. Biggest win, low risk.
2. **Use a Plotly partial bundle** (`plotly.js-basic-dist` or a custom build with only the traces in use: scatter, bar, pie, heatmap, treemap, indicator, waterfall). Can cut Plotly by ~60–70%.

Three.js is only used by the Power Purchase 3D donut — it should be lazy-loaded with that dashboard.

Data fetching is healthy: React Query with 60s refetch, keys correctly scoped by filters, and the Railway dashboard was consolidated to a **single** API call.

---

## 7. Architecture — what's good

- **Clean layering.** `api/` routes → `services/` analytics → `sheets_service` → Apps Script. Business logic never leaks into routes or components.
- **Backend is the single source of truth.** The frontend never invents a number; every KPI traces back to a sheet column. Where the frontend does derive (cumulative %, period buckets, Sankey attribution), it's display maths over backend-supplied values and it's commented as such.
- **Shared chart components.** `BlockTreemap` and `BlockSankey` are used by both Power Purchase and Prosumer, so the two can't drift apart.
- **Additive-only backend changes.** No endpoint, field, or response key was renamed or removed across this whole engagement — every existing consumer still works.
- **Honest empty states.** Charts that can't be drawn from the data (e.g. the ridgeline with a single month) say so instead of interpolating fake values.

---

## 8. Data reality check

| Sheet | Rows | Notes |
|---|---|---|
| `Plant_Purchase_Master` | 80 | **Single month only (2026-04).** Time-series charts (trend, month-heatmap, ridgeline) are structurally limited until more months arrive — they'll light up automatically. |
| `master_ui_deviation_bihar` | 565 → **68 real** | 497 were future-dated placeholders (now filtered). Real data spans 2026-04-01 → 2026-06-07. |
| `input_energy` | 1,694 | Clean. 9 circles, 46 divisions, 85 GSS, 653 feeders. |
| `prosumer_energy_sales` | 82 | Clean. 2 months (Apr–May 2026). |
| `railway_power` | 12 | Clean, but **only 2 months** — trend charts have two points each. |

---

## 9. Recommended next actions, in priority order

1. 🔴 **Restore the Prosumer detail table** (regression, ~15 lines).
2. 🔒 **Move `JWT_SECRET` to the environment and drop the default.** One-line change, closes a token-forgery hole.
3. 🔒 **Decide on real authentication.** The single shared `admin` account is the biggest gap between this and a production government system.
4. ⚡ **Lazy-load dashboard routes.** Cuts the initial download by roughly 5 MB.
5. 🧹 **Delete the dead hooks and two orphan components.** Keep the backend endpoints.
6. 📄 **Reports page** — it currently only wires CSV downloads; it hasn't been reviewed against a reference design in this engagement.
7. 📊 **Excel/PDF export** beyond the Railway page (which has a no-dependency `.xls` export). Adding `xlsx` + `jspdf` would let every dashboard export properly.
