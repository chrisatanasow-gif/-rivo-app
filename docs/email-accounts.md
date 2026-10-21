# Email accounts and driver review

`/account` signs in with a six-digit email code. A new verified identity creates
one permanent RIVO account; its display name is completed in RIVO. `/account/ride`
and `/account/drive` reuse the connected booking, dispatch, fare and GPS flows.
The same verified identity on another browser restores the same participants,
active ride and recent history. Account creation alone never grants driver or
reviewer rights.

## Configuration (feature Preview only)

Use the dedicated test database, with Managed Neon Auth (Better Auth) enabled on
that same branch and database. The browser uses `@neondatabase/auth` through the
same-origin `/api/auth/*` adapter, so iPhone third-party cookie restrictions do
not break the session. No provider URL or token needs browser storage.

Server environment:

- `DATABASE_URL`: dedicated test Postgres connection.
- `NEON_AUTH_BASE_URL`: actual branch Auth base URL from Neon.
- `RIVO_AUTH_RATE_SECRET`: random secret of at least 32 characters.
- `RIVO_REVIEWER_EMAILS`: comma-separated verified emails permitted to review.
  An empty list grants nobody reviewer access. There is no first-user admin.

Add the exact Preview origin to the Neon Auth trusted domains. Keep development,
Preview and Production environments separate. Migrate the dedicated database:

```bash
npm run db:migrate:accounts
```

The migration is additive and repeatable, preserves invitation sessions and rides,
and runs under an advisory transaction lock. It does not move old invitation
history into an email account; the old sessions never proved email ownership.
`/ride`, `/drive` and `/pilot` retain the invitation-only test. Member participants, quotes and rides use separate tables, so even old immutable
invitation deployments cannot read or accept account requests. The reused state
machine also scopes queue and acceptance SQL.

## Session and abuse controls

Only the signed Neon session cookie is forwarded to the configured HTTPS Auth
service. Cookies are Secure, HttpOnly, host-only and SameSite=Lax. Account APIs
verify the provider session, expiry, verified email and ban status; a client
profile or cached session-data cookie is not an identity. The proxy exposes only
OTP sending, OTP sign-in, session lookup and sign-out. Provider tokens, code
values and emails are excluded from application logs and error responses.

POSTs require a matching Origin and bounded JSON. SQL-backed HMAC email/address
limits survive concurrent serverless instances. Code sending has a 60-second
cooldown and six sends per email/hour; verification has 20 attempts per
email/hour, with additional per-address and provider limits. The provider owns
code generation, expiry, single use and delivery.

## Driver review

A driver supplies legal name, contact telephone, vehicle/plate, driver certificate
number, vehicle permit number and validity date, and confirms licensed status.
The application starts pending. RIVO checks the original documents and vehicle
manually; this form is not a government registry verification. It does not ask
for EGN or document uploads.

Only a configured reviewer with a verified session can decide an application at
`/account/review`. Approval requires explicit confirmation of the manual check
and a note. Self-review is blocked. Revision checks reject stale decisions and
every decision has a database audit record. Editing/resubmitting returns the
application to pending; editing during an active driver course is blocked.

Pending, rejected, suspended or expired permits cannot see new requests or accept
them through direct API calls. The acceptance SQL rechecks approval and validity
in Europe/Sofia. A revoked driver's assigned course can still finish safely.

## Verification and limits

```bash
npm run test:accounts
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/rivo-playwright npm run test:browser
npm test
```

Local tests use an isolated PGlite database and an in-memory provider contract
imported only by the local harness. Fixture codes/identities are not accepted by
deployed APIs. They cover OTP errors and reuse, cookies, CSRF, cooldown, identity
validation, re-login persistence, reviewer authorization, revisions, expiry,
revocation, the full lifecycle and legacy queue isolation.

Managed Neon shared SMTP is suitable for development. Before public launch,
configure RIVO's own sender and production mail provider, review account/document
retention and support, and test delivery to real mailboxes. Automated contract
and browser checks do not prove email deliverability or government licensing.
Payments and a public launch remain out of scope.
