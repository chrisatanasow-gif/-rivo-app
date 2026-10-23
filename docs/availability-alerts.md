# Member availability and ride alerts

Applies to `/account/drive` and `/account/ride`. The invitation pilot and root
demo remain separate. Promotion subscriptions, consent and the daily cron are
unchanged; scheduled promotions remain disabled in Preview.

## Work mode

Drivers start offline. An explicit online action opens a 60-second lease, bounded
by the verified Auth session expiry. Visible, connected pages renew every 15s.
Background/closed pages stop renewing; no heartbeat can revive an expired or
explicitly stopped shift. Revisions and shift UUIDs reject delayed commands.
Use the fixed footer or work-mode switch to change availability. Other devices
on the same driver account see the same mode; only the initiating session renews
its shift. A different device can stop it or open a new shift explicitly.

Offline, expired or unapproved drivers get no queue. A database trigger rechecks
fresh presence, approval, permit and distinct customer account on acceptance,
including acceptance from older immutable Preview deployments. It locks the
presence row to serialize stopping and accepting. Existing assigned rides can
still arrive/start/complete after going offline or losing approval. Application
resubmission/suspension stops presence. Account sign-out stops that session's
presence and removes its ride subscriptions before revoking the provider cookie.

## Transactional notifications

Explicit consent binds a native browser endpoint to the verified account, current
role and signed Auth session hash. No raw Auth cookies/tokens are stored in push
tables. The binding expires with the Auth session; re-login requires enabling
again. One browser endpoint belongs to one role at a time. Opt-out affects only
ride alerts for the current account/role; marketing consent is independent.

Ride changes enqueue events in the same database transaction using a member-only
trigger. Incoming requests target currently available, approved, idle drivers,
excluding the customer's own account. Going online also queues current requests.
Customers get accepted/arrived/start/complete/cancel/expiry events; assigned drivers
also get cancellation events. Payloads omit names, addresses and prices.

`api/member-rides.js` dispatches short bounded batches with Vercel `waitUntil`
after successful state/mutation requests. Durable per-device claims deduplicate
concurrent instances; failed or crashed claims retry up to 3 times on later member
requests. Stable tags replace duplicate display after an ambiguous provider ack.
No recurring background dispatcher is enabled in Preview: if everybody closes
RIVO after a failed delivery, retries wait for the next member request. Before
launch, add a monitored scheduler/queue and verify real device delivery.

Each send rechecks current consent, Auth expiry, ride revision, ownership and
driver availability. The service worker independently asks the authenticated
server to validate the device/event before displaying. Logged-out, stale,
unavailable, switched-account or disconnected workers do not display the alert.
Clicks open the corresponding member role and ride, whose current state is read
from the API. Already displayed alerts can become stale; opening always refreshes
the actual state. Signing out also closes displayed ride alerts on this browser.
Dead provider endpoints (404/410) are removed. TLS and provider endpoint allowlists
are preserved. Server logs contain error codes only, no endpoint/keys/payload.

Foreground sound is separate: an explicit tap creates/resumes Web Audio and plays
a short test signal. Each newly seen request beeps once while visible and online.
The browser may suspend audio after locking/backgrounding; enable it again if
prompted. Sound permission/state is not presented as background delivery.

## Deployment and checks

Apply `server/ride-alerts-schema.sql` after the account schema, first on a temporary
Neon test branch. The repeatable migration is additive and transactional:

```sh
npm run db:migrate:ride-alerts
npm run test:ride-alerts
npm run test:accounts
npm run build
npm run test:browser
```

Uses the existing Preview `RIVO_VAPID_PUBLIC_KEY`, `RIVO_VAPID_PRIVATE_KEY` and
`RIVO_PUSH_ORIGIN`. No new provider or paid integration is provisioned.
Browser tests simulate native push subscription/audio. Worker tests exercise
authorization and display suppression with a mock push transport. These tests
do not prove receipt on a physical iPhone: install the PWA from Safari, explicitly
permit notifications, and perform a real two-device delivery check before launch.
Drivers must keep RIVO visible to remain available beyond the one-minute lease.
The installed app opens `/account` via the manifest, keeping the existing app ID
`/`. Browser visits to `/` still open the design demo.
