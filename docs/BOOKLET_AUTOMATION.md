# Energy Accounting Booklet — Automation

Generates the monthly Word booklet (`Energy_Accounting_Booklet_<DISCOM>_<YYYY_MM>.docx`)
live from the same sheets and the same analytics engines the dashboards already use.

Everything added here is **additive**. No existing sheet name, endpoint, field name or
response key was modified. Delete the four new files and the two patched lines and the
application is byte-for-byte what it was.

---

## 1. What's new

| File | Status | Purpose |
|---|---|---|
| `backend/app/services/booklet_builder.py` | new | Assembles the whole booklet as one JSON payload |
| `backend/app/services/booklet_docx.py` | new | Renders that payload to `.docx` |
| `backend/app/api/booklet.py` | new | Four read-only routes |
| `frontend/src/api/bookletApi.ts` | new | React Query hooks + blob download |
| `backend/app/main.py` | **2 lines** | import + `include_router` |
| `backend/requirements.txt` | **1 line** | `python-docx==1.1.2` |
| `frontend/src/api/reportsApi.ts` | new | Shared FY period filter + year union across modules |
| `frontend/src/pages/dashboard/ReportsPage.tsx` | modified | Booklet panel + period filter on the CSV exports |

### Error handling

An explicitly requested month is **validated, not coerced**. The underlying
`_month_filter` falls back to the latest month when it cannot resolve a request — right
for a dashboard (something always renders), wrong here: a typo would hand you a correctly
formatted booklet for the wrong month. So:

| Request | Response |
|---|---|
| `month=garbage`, `month=2026-5` | `400` — malformed, expected `YYYY-MM` |
| `month=2099-12` | `404` — well-formed but no data; response lists available months |
| `discom=BOGUS` | `400` — lists the valid DISCOMs |
| omitted `month` | `200` — latest month with purchase energy (intentional default) |

### Endpoints

```
GET /api/v1/booklet/periods    -> selectable months + DISCOMs
GET /api/v1/booklet/data       -> full payload as JSON (preview / debug)
GET /api/v1/booklet/validate   -> reconciliation checks only (fast pre-flight)
GET /api/v1/booklet/generate   -> the .docx, streamed as a download
```

Query params on `data` / `generate`: `month=YYYY-MM`, `discom=NBPDCL|SBPDCL`,
`include_detail=true|false`, `allocate=true|false`.

---

## 2. Section-by-section source mapping

| Booklet section | Source | Automated? |
|---|---|---|
| Cover page | template + `meta` | ✅ (artwork optional, see §4) |
| Contents | real Word TOC field | ✅ (Word populates on open / F9) |
| 1. Executive Summary — narrative | template with month substituted | ✅ |
| 1.1 Power Flow Summary (generator share) | `Plant_Purchase_Master` grouped by `ppa_type` × `ppa_category` | ✅ |
| 1.2 CTL / STL summary | `transmission_analytics` R12 / R14 / R25 / R26 | ✅ |
| 1.3 DISCOM Input Energy | R18 / R19 — the same single source `AllocationChip` reads | ✅ |
| 2. Power Purchase Summary | `purchase_analytics.get_table_data` | ✅ |
| 3. Energy Flow & Loss Calculation | `transmission_analytics` R2–R27, formulas verbatim with live numbers | ✅ |
| 4. Sale to Prosumers | `prosumer_analytics.get_table_data` | ✅ |
| 5. Circle-wise Consumption | `input_energy_analytics.get_circle_ranking` | ✅ |
| 8. Division-wise Consumption | `input_energy_analytics.get_treemap` | ✅ |
| 9. Feeder-level detail + division subtotals | `input_energy` raw rows | ⚠️ two columns — see §3 |
| A. Reconciliation appendix | computed | ✅ new (not in the manual booklet) |
| Embedded diagrams / screenshots | `backend/assets/booklet/` | ⚠️ see §4 |

### Scope rule (the thing most worth double-checking)

The printed booklet is **not** a single-DISCOM document, and the generator reproduces
that split:

- **Sections 1–4** are **holding-level (BSPHCL)**. Section 2's grand total is the whole
  state's net purchase; CTL/STL are state-boundary losses. Neither is a per-DISCOM figure.
- **Sections 5 / 8 / 9** are **DISCOM-level**, using that DISCOM's **actual** `input_energy`
  rows. Input Energy stays the standing spec exception — actuals only, never
  sharing-ratio allocated.
- **Section 1.3** shows both DISCOMs side by side.

`allocate=true` is an opt-in variant that also scales sections 1–4 by the sharing ratio.
It's off by default because the published booklet does not do this, and switching it on
means section 2 no longer ties to the state's net purchase — it ties to that DISCOM's
allocated share instead.

One subtlety worth knowing: the allocation factor for section 1's Gross-Input build-up is
taken from `app.core.sharing.allocation_factor`, the *same* call `purchase_analytics` makes
— not from the transmission engine's own factor. The sharing engine rounds the ratio to
2 dp before applying it, so sourcing the factor from anywhere else leaves section 1 a few
hundredths of a percent away from section 2 and trips the reconciliation check. One factor,
one source, so the two agree by construction.

### Derivation of the Gross Input build-up

```
Central Thermal   = ppa_type Central, category NOT renewable
Central Renewable = ppa_type Central, category renewable            (= R13)
Intra Thermal     = ppa_type Intra,   category NOT renewable
Intra Renewable   = ppa_type Intra,   category renewable
Embedded          = ppa_type "Intra Renewable Generation Connected
                    to DISCOM Network"                              (= R20)
PMC / PTC Sale    = ppa_type SALE     (negative in the sheet)

Gross Input  = CT + CR + IT + IR + Embedded
Net Purchase = Gross Input − |Sale|          == Section 2 grand total
```

Verified against the May 2026 booklet: `4,016.75 + 539.20 + 578.79 + 31.69 + 4.92 =
5,171.35 MU`, and `5,171.35 − 693.22 = 4,478.13 MU`, matching the printed section 2
grand total exactly.

---

## 3. Known gaps — read before going live

**(a) Section 9's "Meter S.No. / CA no" and "Sharing %" columns.**
No dashboard surfaces these, so I could not confirm from the code whether the
`input_energy` sheet carries them. The builder probes a list of candidate column names
and degrades gracefully rather than crashing:

```python
METER_KEYS   = ("meter_no", "meter_sno", "meter_serial", "ca_no", "consumer_no", "meter_ca_no")
SHARING_KEYS = ("sharing_pct", "sharing_percent", "sharing_ratio", "share_pct", "sharing")
```

If none match, the meter column renders blank, sharing defaults to `100%`, and a red note
is printed in that section of the document plus a flag on `/booklet/data`. **Action:** run
`GET /api/v1/booklet/data?include_detail=true` once against the live sheet and check
`section_9.meter_column_available` / `sharing_column_available`. If either is `false`,
add the real column name to the tuple above — a one-line change.

This matters: the printed booklet shows feeders shared across divisions at 32% / 67%.
Defaulting those to 100% would double-count them. Until this is confirmed, treat section
9 as *needing review*, not final.

**(b) Section numbering.** The published booklet jumps 5 → 8 → 9; there is no 6 or 7.
That gap is reproduced deliberately so the generated document matches the printed one.
Fix `SECTION_NUMBERS` in `booklet_builder.py` if the numbering is ever corrected.

**(c) Prosumer plant list.** The printed booklet lists all ~42 prosumer plants including
zero-value rows. The generator prints whatever `prosumer_energy_sales` returns for the
month. If the sheet only carries non-zero rows, the generated list will be shorter than
the printed one. Not a number error — a completeness difference worth eyeballing once.

**(d) Voltage / PPA columns in section 2** come straight from `voltage_level` and
`ppa_category`. If those are blank on any plant row, the cell prints blank rather than
guessing.

**(e) The narrative prose is templated, not generated.** Section 3's explanatory
paragraphs are fixed text with live numbers substituted. That's intentional — this is a
regulatory document, and the wording should not drift month to month. Editing the prose
means editing `booklet_docx.py`.

---

## 4. Images

Optional. Drop files into `backend/assets/booklet/` (override with `BOOKLET_ASSET_DIR`):

| Filename | Where it lands |
|---|---|
| `cover.png` | Cover page |
| `power_flow.png` | End of section 1 |

Missing files degrade to a grey caption box, so the booklet always generates on a clean
checkout. The screenshots embedded in the manual booklet (SAMAST portal captures, the
distribution map) can be added the same way as more filenames if needed — they're static
assets, not derivable from the sheets.

---

## 5. Reconciliation appendix

Four independent cross-checks run at generation time, tolerance 0.01% (the project's
standing allocation validation rule):

1. Net Purchase (§1) = Section 2 grand total
2. Circle total (§5) = Division total (§8)
3. Division total (§8) = Feeder detail total (§9)
4. Circle total (§5) = that DISCOM's input energy (R18 / R19)

Results print as a table at the back of the document, are returned by `/booklet/validate`,
and surface in the UI *before* you spend a minute waiting on a render. A failure does not
block generation — it flags the document, which is safer than silently shipping a wrong
number. `X-Booklet-Reconciliation: pass|warn` is set on the download response.

---

## 6. Install & run

```bash
cd backend
pip install -r requirements.txt          # picks up python-docx
uvicorn app.main:app --reload

# smoke test
curl "http://localhost:8000/api/v1/booklet/validate?month=2026-05&discom=NBPDCL"
curl -OJ "http://localhost:8000/api/v1/booklet/generate?month=2026-05&discom=NBPDCL"
```

Frontend needs no new dependency — `axios`, `@tanstack/react-query` and `lucide-react`
are already in `package.json`.

**Build note:** use `npm ci`, not `npm install`, so TypeScript stays pinned at 5.9.3.
TypeScript 6.0.3 breaks the build on the `baseUrl` setting.

---

## 7. Performance

Section 9 is the expensive part — one row per feeder per month, in the thousands. The
sheets layer's 60s TTL cache and single-flight lock already collapse the six sheet fetches,
so a warm generation is fast; a cold one pays the Apps Script round-trip once.

`include_detail=false` skips section 9 entirely and returns in about the time a normal
dashboard load takes — that's what `/booklet/validate` uses.

`booklet_docx.render()` is synchronous CPU work — python-docx builds the whole XML tree
in memory, measured at ~0.9 s for a full feeder-level booklet. It runs via
`run_in_threadpool` rather than directly on the event loop. Without that, five concurrent
generates stall *every* request (including the dashboards) for five seconds; with it, a
health probe answers in ~5 ms during the same load. Throughput is unchanged — the GIL
still serialises the CPU work — but there is no head-of-line blocking.

If generation ever times out at the proxy, the next step is to move `/generate` to a
background task returning a job id. Not needed at current data volumes, but that's the
direction rather than raising the timeout indefinitely.


---

## 8. Reports page period filter

A shared **Financial year / Quarter / Month** filter sits above the five CSV export cards
and is applied to all of them. **No backend change was needed** — every `/table` endpoint
already accepts `year`, `quarter` and `month`.

### FY semantics (not calendar semantics)

Mirrors `app/core/fy.py` exactly:

| Param | Meaning |
|---|---|
| `year` | FY **start** year. `2026` = FY 2026-27 = Apr 2026 - Mar 2027 |
| `quarter` | **Financial** quarter. Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, **Q4=Jan-Mar** |
| `month` | Plain calendar month number, `01`-`12` |

Q4 falls in the *next* calendar year, so "January" under FY 2026-27 resolves to Jan 2027.
The backend gets this right already: `in_fy` restricts rows to the financial year first,
then the month filter picks within it, so `year` + `month` can never resolve to the wrong
calendar year.

### Behaviours worth knowing

* **Only set params are sent.** With nothing selected the request is byte-identical to what
  it was before this filter existed, so the default export behaviour is unchanged.
* **Quarter/month conflicts are prevented.** Selecting Q1 clears a stranded January rather
  than sending a contradictory pair the backend would silently resolve to zero rows. The
  month dropdown is restricted to the chosen quarter's months.
* **Month without a year** matches that month across *every* year in the sheet. That is
  legitimate (useful for year-on-year comparison) but easy to do by accident, so the UI
  warns inline when a quarter or month is set with no year.
* **The year list is a union** across all five modules' `/filters`, not one module's list.
  The sheets are not filled in lockstep — purchase may already carry a year that
  `input_energy` does not. A union means a year is never hidden; an export with no rows for
  it simply comes back empty, which is the honest outcome and already alerted by
  `downloadCsv`.
* **Filenames carry the period**, e.g. `purchase_report_FY2026-27_Q3_November.csv`, so
  downloaded files stay self-describing. Unfiltered exports get `_all_periods`.

### The booklet keeps its own picker

Deliberately not wired to this filter. The booklet is a **single-month** regulatory
document — there is no such thing as a quarterly or annual edition of it, and CTL/STL are
computed for one billing month. Sharing one control would have implied a quarterly booklet
is possible.

### Energy Balance Table export (added)

The losses dashboard's banded A/B/C/D balance table is now also a CSV export on the Reports
page, reusing the existing `/transmission/balance-table` endpoint — **no backend change**.

It behaves differently from the five `/table` exports, and the UI says so on the card:

* It is a **single-month snapshot**, not a paginated list. It resolves to exactly one month,
  so it honours `year` + `month` and **ignores quarter** (a quarter is three months; a balance
  table is one). The card shows "quarter ignored" when a quarter is selected.
* With no month chosen it falls back to the **latest** month — the same default the
  Transmission dashboard shows. That fallback is correct here (a losses snapshot should always
  render something), unlike the booklet, where a wrong month must fail loudly.
* The CSV keeps the dashboard's exact structure: Band, R# reference, Particulars, Formula, MU
  (with sign convention preserved — "Less:" rows stay negative), and % of Boundary. So the
  export reconciles line-for-line against the on-screen table.

### Not included

A DISCOM selector on the exports. It is a natural next addition, but note the endpoints are
not uniform: `input-energy` takes `discom_name` while the other four take `discom`. That
mapping has to be handled per-report rather than passed through blindly.
