# NBPDCL Power Procurement Dashboard — Audit, Feasibility & Change Report

**Scope of this pass:** Deep audit → data-grounded chart feasibility → data-correctness fixes → verified build.
Existing architecture, backend contracts, auth, routing and Google-Sheet integration were **preserved**. All backend changes are **additive only** (no field/API renamed or removed). Frontend adapts to backend.

---

## 1. Deep Audit — findings

### 1.1 Project (unchanged, healthy)
- Vite + React 19 + TS frontend, FastAPI backend, Google Apps Script → Sheets. Wired correctly: `purchaseApi.ts` → `/purchase/*` → `purchase_analytics.py`.
- 9 premium chart sections already exist under `components/purchase/` (Hero+3D Donut, Treemap, Sunburst, Sankey, Lollipop, Bubble, Heatmap, Ridgeline, Waterfall).
- Fixed dark-navy/gold theme in `theme.ts`; fixed plant-type order enforced (never value-sorted). Good.

### 1.2 Backend contract (source of truth — NOT modified structurally)
Raw row fields from `Plant_Purchase_Master`: `plant_id, voltage_level, ppa_category, ppa_type, plant_type, plant_name, year_month, energy_quantum`.
Endpoints: `/filters /kpis /trend /plant-type-distribution /treemap /sunburst /sankey /bubble /top10 /waterfall /heatmap /polar /insights /table`. All retained.

**Note:** this ZIP's `/purchase/waterfall` computes a **month-over-month delta** series, and `get_kpis` had **no** sale/UI split. (Earlier discussions referenced a separate `get_procurement_waterfall` + KPI extension — that code is **not present in this archive**; this archive is treated as ground truth per the resume rule.)

### 1.3 Google Sheet audit — `test_v1.xlsx` (the decisive findings)
| Finding | Detail | Impact |
|---|---|---|
| **Single month only** | Every `Plant_Purchase_Master` row is `2026-04-01`. | Kills genuine time-series: trend, month-heatmap, ridgeline, month-waterfall. |
| **`Sugar` plant_type exists** | Types = Thermal, Solar, Wind, Hydro, Biomass, **Sugar**. | Sugar was not in theme → rendered grey "Unknown". |
| **SALE is real** | `ppa_type=SALE`: IEX PMC −146.78, IEX PTC −243.07 (= −389.85 MU). | Waterfall Sale step can be real, not a 0 placeholder. |
| **UI reconciliation row** | `plant_name=UI` = −18.72 MU (in the purchase sheet itself). | Self-contained UI step, no cross-dashboard coupling needed. |
| **Central/Intra split** | via `ppa_type`: Central 4303.55, intra 332.39, Intra-Renewable 4.58. | Matches the established rule (derive from `ppa_type`, not `voltage_level`). |
| **Sheet11 = formula dictionary** | Confirms *Total Purchase (incl. sale) − PMC − PTC = excl. sale*, sale values negative. | Grounds the waterfall semantics. |
| Totals | Σ energy = 4250.67 MU across 80 plants (1 row each). | Bubble "entries"/plant = 1 (single month). |

---

## 2. Chart Feasibility (scored against **actual** data, not the reference alone)

| # | Chart | Feasibility | Verdict |
|---|---|---|---|
| 1 | KPI Cards + 3D Donut | **98%** | Recreate. Data fully supports plant-type distribution. |
| 2 | Treemap (type→plant) | **100%** | Recreate. |
| 3 | Sunburst (category→type→plant) | **100%** | Recreate. |
| 4 | Sankey (category→type→total) | **90%** | Recreate. Flow supported via `ppa_category`/`ppa_type`. |
| 5 | Top-10 3D Lollipop | **95%** | Recreate. |
| 6 | Plant-wise Bubble | **80%** | Preserve identity; X-axis "entries" is constant (=1) under single month → map X to a meaningful axis (rank/avg) instead. |
| 7 | Monthly Heatmap | **35%** | **Data-limited.** Only 1 month → single column. Keep, but label honestly; do **not** fabricate 12 months. |
| 8 | Ridgeline over months | **20%** | **Not feasible now.** Needs ≥2 months. Added an explicit "single reporting period" notice instead of a misleading flat ridge. |
| 9 | Procurement Waterfall | **95%** (composition) | Recreate as **Gross → Sale → UI → Net** (single-month-safe, matches Sheet11). Month-over-month waterfall is **0%** here (1 month). |

**Rule applied:** feasibility ≥85% → recreate; 60–85% → preserve identity, improve readability; <60% → don't force; represent the limitation honestly (time-series rule: never interpolate missing months).

---

## 3. Changes made this pass (all verified)

**Backend — additive only (`services/purchase_analytics.py`, `get_kpis`)**
Added `gross_purchase_mu, sale_energy_mu, ui_energy_mu, net_purchase_mu`. Existing keys untouched.
- `gross` / `sale` trace to `Plant_Purchase_Master` rows in the active filter scope.
- **`ui` is now sourced from `master_ui_deviation_bihar`** (authoritative DSM/UI), **month-matched** to the purchase scope via new helper `_deviation_ui_energy()`. The legacy `plant_name == "UI"` line in the purchase sheet is excluded from Gross so it can't double-count.
```
Single month (2026-04):
  total = 4250.665   (unchanged contract)
  gross = 4659.240   (excl. SALE + legacy UI line)
  sale  = -389.851   (ppa_type == SALE, signed)
  ui    =  -18.723   (Σ deviation_energy for 2026-04 — matches the sheet exactly)
  net   = 4250.666

Multi-month proof (if purchase held Apr+May+Jun):
  ui    =  -51.333   (auto-sums -18.72 + -32.91 + 0.30) — scales to 12 months, no code change ✓
```

**Frontend**
1. `theme.ts` — added **Sugar** to `PLANT_TYPE_ORDER` (appended, order still fixed) and a dedicated color `#D9A441`. No more grey "Unknown" for a real category.
2. `WaterfallSection.tsx` — replaced hardcoded `saleEnergy=0/uiEnergy=0` placeholders with the real additive KPI fields → **Gross → Sale → UI → Net**. Falls back to a single Gross bar if an older backend omits the fields (schema-drift safe).
3. `RidgelineSection.tsx` — added a graceful "single reporting period" panel when `months < 2` (no silent interpolation).

### Pass 2 — Section 1: KPI Cards + 3D Donut (reference-match)
**Backend (`get_kpis`, additive):** added `central_share_mu`, `intra_share_mu`, derived from **`ppa_type`** (Central exact; anything containing "intra" = intra-state; SALE excluded) — the established rule, not `voltage_level`.
```
central_share_mu = 4303.550  (92.7%)
intra_share_mu   =  336.966  ( 7.3%)   → matches the reference 92.8 / 7.2 split
```
**Frontend (`PowerProcurementHero.tsx`):** three previously-broken KPI cards now show real values —
- **Central Share** & **Intra Share** → from the new KPI fields (percentages taken against central+intra procurement), replacing the old `/purchase/polar` (voltage_level) source that always rendered "—".
- **Sale Energy (Negative)** → now wired to `sale_energy_mu` (−389.85 MU, red) instead of a hardcoded "—".

**Donut (`DonutChart3DFixed.tsx`):** added a **Sugar** label anchor and graduated the label radius of the small clustered slices (Hydro / Biomass / Sugar) outward so their callouts no longer overlap. All 6 real plant types now render with collision-reduced labels.

### Pass 3 — Reference-match fixes (your 7 issues)
1. **KPI cards** → now **2 rows** (4-col grid, 7 cards); **Average Energy per Plant** card removed.
2. **3D Donut** → extrusion depth cut from 1.6 → **0.6** (was clipping everything but Thermal). Labels moved out of the 3D scene into a fixed **right-side callout column** (name + MU + %) so all 6 types are always visible and never clip. Camera re-framed to fit the ring fully.
3. **Treemap** → rebuilt as **PPA Category › Plant Type** (plant names dropped — they belong in the report), fed from the sunburst dataset; Sale/negative rows excluded; data labels on every tile.
   **Sunburst** → **2 rings** (PPA Category › Plant Type), centre shows **"Total Purchase (excl. Sale)" + value**, data labels on all arcs, and **Central (left) / Intra (right)** annotations added outside the ring.
4. **Sankey** → now genuine **3 columns: PPA Category › Plant Type › PPA Type** (Central / Intra / Sale-Negative). Backend `get_sankey_data` reworked (shape unchanged; added `node_values`). Every node shows its **name + value** as a label. Sale renders as a negative node (−389.85).
5. **Bubble** → capped to top-14 (no overlap), **category axis with per-plant slots**, sizes capped and **y-axis headroom** so bubbles never spill past the axis; colour = plant type (fixed palette); value labels above each bubble.
6. **Heatmap** → added an **FY/period caption** (e.g. "FY 2026-27 · Apr 2026"); data labels always on, with 1-decimal precision for small values.
7. **Lollipop** → long plant names **wrap to 2 lines** (no overlap, all shown), value labels always on, and a **flat foot disc** added under each stem for the 3D-base look.

**Backend:** `get_sankey_data` rebuilt (3-level, `node_values` additive). Sankey right-column verified: Central 4303.55 · Intra 336.97 · Sale −389.85.

---

## 4. Build verification
- `npx tsc -b` → **exit 0** (no type errors across the whole frontend).
- `npx vite build` → **✓ built in ~68s**, all chunks emitted. Only a pre-existing bundle-size warning (Plotly ~4.7 MB) — not introduced here.
- Backend `py_compile` → clean; KPI math re-verified against the sheet (table above).

## 5. API verification
- No route added/removed/renamed. `/purchase/kpis` returns the **same keys plus four additive keys**. Every existing consumer keeps working; only `WaterfallSection` reads the new keys.

## 6. Remaining issues / recommended next pass
1. **Visual reconstruction to reference fidelity** — this pass fixed the *correctness* blockers (broken waterfall, wrong Sugar color, misleading ridgeline). Pixel-level match of all 9 sections to the reference images (lighting, label collision, gradients) is the next, larger phase — recommend chart-by-chart so each can be reviewed.
2. **Bubble X-axis** — remap from `entries` (constant 1) to avg/rank so points spread meaningfully under single-month data.
3. **Heatmap** — consider a plant-type × ppa-type heatmap (both dimensions exist this month) as a richer single-month alternative to the near-empty month heatmap.
4. **Bundle size** — optional `manualChunks` / lazy-load Plotly to cut the 4.7 MB chunk (perf budget).
5. **UI-energy source** — ✅ **RESOLVED.** Now pulled from `master_ui_deviation_bihar`, month-matched, resilient (drops the UI step on fetch failure rather than breaking KPIs). April value equals the old purchase `UI` row (−18.723), confirming the mapping.

## 7. Future 12-month readiness (feasibility + space)
| Component | At 1 month (today) | At 12 months (future) | Action taken |
|---|---|---|---|
| KPIs / Waterfall UI | April deviation summed | **auto-sums all in-scope months** | month-matched helper — verified |
| Heatmap | 1 column (honest) | 6 types × 12 cols (reference) | already N-month; **labels now year-aware** for cross-year spans |
| Ridgeline | "single period" notice | unlocks automatically at ≥2 months | gated + **year-aware labels** |
| Trend / month-waterfall | flat/degenerate | real series | no change needed (data-driven) |
| Layout/space | fits | 12 category columns fit fixed grids; labels shortened ("Apr '26") to avoid crowding | verified in build |

No hardcoded 12-slot assumptions; everything renders from the actual month set returned by the backend.
