# Project Structure

```
NBPDCL_ENTERPRISE_DASHBOARD/
├── backend/
│   ├── app/
│   │   ├── api/            # Route handlers (auth, purchase, sheets)
│   │   ├── core/           # Config
│   │   ├── services/       # Google Sheets fetch/cache + analytics engines
│   │   ├── models/         # (reserved for Pydantic schemas as phase 2 expands)
│   │   └── main.py         # FastAPI app entrypoint
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios client + React Query hooks
│   │   ├── components/
│   │   │   ├── layout/     # Sidebar, Header, DashboardLayout
│   │   │   ├── cards/      # KpiCard
│   │   │   ├── charts/     # ChartCard wrapper, DonutChart3D, EnergySunburstChart
│   │   │   └── filters/    # FilterBar
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── dashboard/  # PowerPurchaseDashboard, GenericModuleDashboard, Reports, Settings
│   │   ├── routes/         # ProtectedRoute
│   │   ├── store/          # Zustand auth store
│   │   ├── styles/         # Tailwind entry
│   │   └── App.tsx / main.tsx
│   ├── package.json
│   └── .env.example
├── docs/
├── docker-compose.yml
├── README.md
└── .env.example
```
