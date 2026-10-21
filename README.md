# RIVO Full App

A modular mobile-first RIVO prototype with three connected experiences:

- Customer app
- Driver app
- RIVO Control admin dashboard

The `/ride` customer and `/drive` driver routes connect the RIVO designs to the
same closed test with server-side sessions, Postgres ride storage and shared
acceptance/status updates. The older `/pilot` interface remains available.
See [customer flow](docs/connected-customer.md), [driver flow](docs/connected-driver.md)
and [test setup](docs/two-phone-pilot.md). The test requires a dedicated preview
database and a server-only invitation code.

Permanent verified-email profiles are available at `/account`, with account-linked
rides and manual driver approval. See [email accounts](docs/email-accounts.md) for
setup, permissions, verification and the boundary with invitation testing.

Screens and the map engine load on demand. See [mobile loading](docs/mobile-loading.md)
for measurements, failure recovery and the scope of the performance checks.

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
`/ride`, `/drive` and `/pilot` flows persist requests and synchronize participants through
Postgres; it offers one RIVO service with a shared driver queue and estimates fares from driving distance using one example tariff. It does not process payments or approve real drivers. See [distance pricing](docs/distance-pricing.md) for the formula, quote validation, and scope.
