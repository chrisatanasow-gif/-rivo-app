# Account onboarding and passenger pickup

The live member experience starts at `/account/ride`. Email verification asks for
only the display name on first sign-in, then continues to the requested route.
A driver entering `/account/drive` completes the name before the application.
`/account` is a compact profile with a visible booking action and optional name
editing. The driver application lives at `/account/driver-application` and opens
only by choosing “Карай с RIVO” or entering the driver route without an application.
Review and driver authorization remain enforced by the existing server.

A failed profile lookup has a recovery screen. It does not pretend the user is
signed out or invite another email code. Only an actual 401 opens sign-in.
Transport/HTML failures and Auth SDK errors have Bulgarian messages. Requests
have timeouts, abort on unmount, and stale replies cannot restore a signed-out
profile. Form errors preserve the user's current input. A successful OTP followed by a
failed profile read uses profile recovery instead of retrying the consumed code.
Profile/application saves render the server-confirmed response without a second
read that could misreport a successful save as a failure.

## Choosing a real pickup

Member booking has no assumed pickup from Pernik's centre. The passenger chooses
one through address suggestions/search, a map click or the explicit GPS action.
The closed invitation test retains its existing preset for compatibility.

`requestPickupLocation` is a one-shot browser lookup in a secure context. It does
not prompt on page load or create a location watcher. It requests high accuracy
and no cached position, with both browser and application timeouts of 12 seconds.
It rejects invalid coordinates, missing/invalid accuracy, samples older than
30 seconds or more than 5 seconds ahead, and accuracy worse than 250 metres.
Permission refusal, timeout or low accuracy leave the previous explicit pickup
unchanged; when none was selected, it stays empty. No city fallback becomes GPS.

Address lookup labels the measured or map-selected point. Its result must never
move the pickup to a nearby building or street centre. If street lookup fails,
the chosen coordinates remain usable with an honest generic label. The passenger
can inspect the pin and edit the place before booking. There is no price or
submission until both places have valid coordinates and lookup has finished.

Editing or selecting a place, cancelling the lookup, leaving the address step or
unmounting invalidates earlier async work. Late GPS/reverse-search results cannot
replace a newer choice. The server-stored quote and create payload use the same
measured coordinates; the server still determines price from road distance.

## Checks

```bash
npm run test:pickup
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/rivo-playwright npm run test:browser
```

Five isolated GPS-service checks cover measured values/options, refusal/errors,
invalid or stale data, timeout and unsupported contexts. Browser scenarios cover
first-time route continuation, compact profiles at 320/390px, driver entry,
profile/network recovery, Auth errors, no unsolicited permission prompt, GPS to
quote/create, refused/inaccurate GPS, explicit manual selection, cancellation,
late replies and unavailable street names. Browser GPS is emulated. These checks
do not establish physical device accuracy or real mailbox delivery.

No database schema, environment variable or server API change is required.
