# Availability and ride alerts verification

Story: a verified, approved driver explicitly goes online, receives eligible requests and foreground sound, accepts one shared course, can stop accepting new work while finishing the assigned course, and signs out with availability and device bindings revoked. Transactional push uses explicit per-role consent and current-state authorization.

## Local evidence

- Build passed. Existing map-engine large-chunk warning remains.
- 12 availability/transactional push/worker checks passed.
- 12 accounts/Auth checks passed, including the real Auth-handler sign-out cleanup composition.
- 24 legacy pilot API checks passed.
- 13 marketing push checks passed unchanged.
- 83 full browser scenarios passed. After the install-manifest adjustment and added disconnect/permission-failure coverage, 3 focused availability/alerts browser scenarios passed.
- Tests use isolated PGlite, synthetic provider contracts and mocked native push/audio. No test send to a real user.

## Neon migration

- Dedicated test project: snowy-bonus-06480866, database rivo_pilot.
- Temporary child br-fragrant-night-baidsnm0, expires 2026-10-23T20:00:00Z.
- Additive migration applied twice on child. Real Postgres trial blocked offline acceptance, accepted online, completed while offline and atomically stored 4 customer events. The synthetic child driver was suspended.
- Same additive migration applied transactionally to the dedicated Preview parent br-weathered-scene-ba8mc7e0 after local and child checks. No Production database changed.

## Deployment

- Commit: 5bca3c596305298aecb5c7bd001f78259cf78619.
- Feature branch: feat/shared-ride-requests.
- Preview deployment: dpl_wF4Hoqpy5eky3pNvQif3beHMBJZL.
- Immutable URL: https://rivo-2g2uhxfov-rivo6.vercel.app/
- Main remains e2c9debbd902151d71984e98e39aca1d43cbf413.
- Deployment READY, target null (Preview), exact project/SHA/ref confirmed. Exact immutable origin added to Neon Auth trusted origins.

## Published story

- Two controlled `.invalid` accounts with genuine signed Managed Neon sessions; only their synthetic verified flags were seeded. Profile and pending driver application completed in the actual UI; synthetic driver approval was labelled test-only, then suspended after QA.
- Published browser -> member API -> dedicated Neon -> UI completed exactly one course: c6edb84e-8549-44e6-bd0c-8dce49ff659b, frozen 309 cents / 3,09 EUR.
- Offline queue empty; a direct acceptance request returned 409 PRESENCE_REQUIRED.
- Explicit online action exposed the request; actual periodic heartbeat extended its lease.
- Explicit foreground audio enabled without a browser error; no claim that a physical speaker was heard.
- Browser network disconnect hid availability; reconnect restored it while the existing server lease remained valid.
- Driver accepted, went offline for new work and still arrived, started and completed the assigned course. Customer status/pill updated to arrived and receipt retained the same fare.
- Driver acceptance button remained pinned at 320x568; inspected screenshots at 320/390. No horizontal overflow or JS page errors.
- Actual DB recorded 5 events: incoming request plus accepted, arrived, in-progress and completed for the customer. No live push binding was added and no real recipient was notified.
- Actual VAPID config available. Both genuine sessions signed out through the published SDK/Auth handler, subsequent member state requests returned 401. Synthetic driver suspended after verification.
- Artifacts: preview-course.json/log, preview-driver-offline-390.png, preview-assigned-offline-arrived-320.png, preview-receipt-390.png.
- Physical notification receipt remains unverified; native push/audio and provider retries are verified with controlled local mocks.

## Material limits

A 60-second foreground-renewed lease is intentional; backgrounded/closed drivers stop receiving new work after expiry. The installed app opens /account; browser / remains the demo. Foreground audio requires a tap and may be suspended by the OS. iPhone Web Push needs an installed PWA and explicit permission. Physical device notification receipt, real mailbox delivery and public-launch readiness are not established by these tests.

Dispatch has durable per-device claims and retries on later member requests. No periodic transactional dispatcher runs in Preview; if all clients close after a failed provider send, retry waits for the next member request. Add monitored scheduling and real device delivery checks before launch. Marketing cron behavior remains unchanged and disabled in Preview.

Final cleanup confirmed: fixture driver suspended and offline, 0 live fixture push bindings; both QA proxies stopped, temporary .env.preview and private signed-session fixture file removed. Draft PR #1 updated; main and Production unchanged.
