# RIVO Full App

A modular mobile-first RIVO prototype with three connected experiences:

- Customer app
- Driver app
- RIVO Control admin dashboard

The `/pilot` route adds a separate closed two-phone test with server-side sessions,
Postgres ride storage and real acceptance/status updates. Setup, scope and the
two-phone checklist are documented in [docs/two-phone-pilot.md](docs/two-phone-pilot.md).
It requires a dedicated preview database and a server-only pilot invitation code.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Import this repository in Vercel. Framework preset: **Vite**. No environment variables are required for the prototype.

## Structure

- `src/apps/CustomerApp.jsx` — customer booking flow
- `src/apps/DriverApp.jsx` — driver flow
- `src/apps/AdminApp.jsx` — admin/control center
- `src/components/` — reusable interface elements
- `src/data/mockData.js` — prototype data
- `src/lib/storage.js` — local persistence
- `public/assets/` — RIVO vehicle and brand assets

## Important

The main `/` experience is an interactive prototype. It includes browser location,
address-search and routing integrations, while dispatch, payments, authentication,
notifications and ride history in that experience remain demonstrations. The
separate `/pilot` flow persists requests and synchronizes participants through
Postgres; it offers one RIVO service with a shared driver queue and estimates fares from driving distance using one example tariff. It does not process payments or approve real drivers. See [distance pricing](docs/distance-pricing.md) for the formula, quote validation, and scope.
