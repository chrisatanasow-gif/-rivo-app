# RIVO Full App

A modular mobile-first RIVO prototype with three connected experiences:

- Customer app
- Driver app
- RIVO Control admin dashboard

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

This package is a polished interactive prototype. The map, driver dispatch, payments, authentication, GPS, push notifications and real ride persistence are simulated locally. The project is structured so those services can be replaced with real APIs later without rebuilding the UI from scratch.
