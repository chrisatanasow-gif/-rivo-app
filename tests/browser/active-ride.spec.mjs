import { test, expect } from "@playwright/test";
import { selectDemoSofia } from "./helpers/demo-destination.mjs";
const KEY = "rivoActiveDemoRideV1";
const TIME = new Date("2026-10-17T08:00:00Z");
async function fixtures(page, clock = true) {
  if (clock) await page.clock.setFixedTime(TIME);
  const context = page.context();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42.6019, longitude: 23.0334 });
  await context.route("https://tiles.basemaps.cartocdn.com/**", route => route.fulfill({ status: 503, body: "Fixture" }));
  await context.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: { name: "Перник", lat: "42.6019", lon: "23.0334" } }));
  await context.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 5000, duration: 600, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.3219, 42.6977]] } }] } }));
  await page.goto("/");
}
async function book(page, discounted = false) {
  if (discounted) { await page.getByRole("button", { name: "Известия и оферти", exact: true }).click(); await page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" }).click(); }
  await selectDemoSofia(page);
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
}
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);

for (const [width, height] of [[320, 568], [390, 844]]) test(`reload restores each active stage and frozen discount with no duplicate history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  // Keep the business date deterministic without freezing React's async-loading
  // scheduler or requestAnimationFrame. Only lifecycle timestamps move below.
  await page.clock.setFixedTime(TIME);
  await fixtures(page, false);
  await book(page, true);
  await expect(page.locator(".customerMatching")).toBeVisible();
  const saved = await read(page);
  expect(saved.fare.priceCents).toBe(405);
  await page.reload();
  await expect(page.locator(".customerMatching")).toBeVisible();
  await expect(page.locator(".rideRecoveryNotice")).toBeVisible();
  expect((await read(page)).id).toBe(saved.id);
  await page.clock.setFixedTime(new Date(saved.bookedAt + 1200));
  await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
  await page.context().setGeolocation({ latitude: 42.6977, longitude: 23.3219 });
  await page.context().route("https://router.project-osrm.org/**", route => route.fulfill({ status: 503, body: "Route provider down after booking" }));
  await page.evaluate(() => localStorage.setItem("rivoTariffV2", JSON.stringify({ baseFareCents: 900, perKmCents: 1000 })));
  await page.reload();
  await expect(page.locator(".arrivalStatus")).toHaveText("ШОФЬОРЪТ ПРИСТИГНА");
  await expect(page.locator(".pickupSummary")).toContainText(saved.pickup.label);
  await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  const started = await read(page);
  await page.clock.setFixedTime(new Date(started.tripStartedAt + 5000));
  await expect(page.locator(".progress i")).toHaveAttribute("style", "width: 30%;");
  await page.reload();
  await expect(page.locator(".customerTrip")).toBeVisible();
  await expect(page.locator(".activeTripCard .price")).toHaveText(/4,05/);
  await expect(page.locator(".progress i")).toHaveAttribute("style", "width: 30%;");
  const trip = await read(page);
  expect(trip.id).toBe(saved.id); expect(trip.route).toEqual(saved.route);
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/4,05/);
  await page.getByRole("button", { name: "+2 €", exact: true }).click();
  expect(await read(page)).toBe(null);
  await page.reload();
  await expect(page.locator(".homeContent")).toBeVisible();
  // A stale snapshot left by an interrupted cleanup must not revive a completed ride.
  await page.evaluate(({ key, trip }) => localStorage.setItem(key, JSON.stringify(trip)), { key: KEY, trip });
  await page.reload();
  await expect(page.locator(".homeContent")).toBeVisible();
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await expect(page.locator(".historyRow")).toHaveCount(1);
  await expect(page.locator(".historyRow")).toContainText(/6,05/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a reopened page resumes arrival by elapsed time and cancellation clears the active snapshot", async ({ page }) => {
  await fixtures(page); await book(page);
  const saved = await read(page), context = page.context();
  await page.close();
  const reopened = await context.newPage();
  await reopened.clock.setFixedTime(new Date(saved.bookedAt + 60000));
  await reopened.goto("/");
  await expect(reopened.locator(".arrivalStatus")).toHaveText("ШОФЬОРЪТ ПРИСТИГНА");
  await expect(reopened.locator(".customerTrip")).toHaveCount(0);
  await reopened.getByRole("button", { name: "Откажи курса", exact: true }).click();
  await reopened.getByRole("dialog").getByRole("button", { name: "Откажи курса" }).click();
  expect(await read(reopened)).toBe(null);
  await reopened.reload();
  await expect(reopened.locator(".homeContent")).toBeVisible();
  expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem("rivoCustomerProfileV1"))?.rides || [])).toHaveLength(0);
});

test("a next-day notification cannot replace an active trip or expire its confirmed discount", async ({ page }) => {
  await fixtures(page); await book(page, true);
  await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  const original = await read(page);
  await page.clock.setFixedTime(new Date(TIME.getTime() + 14 * 60 * 60 * 1000));
  await page.goto("/?offer=daily-2026-10-18");
  await expect(page.locator(".customerTrip")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Нещо добро за днес." })).toHaveCount(0);
  expect((await read(page)).id).toBe(original.id);
  await expect(page.locator(".activeTripCard .price")).toHaveText(/4,05/);
  await expect(page.locator(".routeSummary")).toContainText(original.destination.label);
});

test("invalid or expired active data is discarded safely without inventing an active course", async ({ page }) => {
  await fixtures(page); await book(page);
  const saved = await read(page);
  for (const invalid of [{ ...saved, bookedAt: saved.bookedAt - 2 * 86400000 }, { ...saved, fare: { ...saved.fare, priceCents: -1 } }, { ...saved, pickup: { label: "Bad", lat: null, lng: null } }]) {
    await page.evaluate(({ key, invalid }) => localStorage.setItem(key, JSON.stringify(invalid)), { key: KEY, invalid });
    await page.reload();
    await expect(page.locator(".homeContent")).toBeVisible();
    await expect(page.getByText("Старият запис за демо курс е изтекъл или невалиден. Можеш да започнеш нов курс.")).toBeVisible();
    await expect(page.locator(".customerRide")).toHaveCount(0);
    expect(await read(page)).toBe(null);
  }
});

test("storage failure is visible and retry saves the current active stage", async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    window.__blockActive = true;
    Storage.prototype.setItem = function(name, value) { if (name === key && window.__blockActive) throw new Error("Blocked"); return original.call(this, name, value); };
  }, KEY);
  await fixtures(page); await book(page);
  await expect(page.getByText(/Курсът продължава тук, но не успяхме да го запазим/)).toBeVisible();
  await page.evaluate(() => { window.__blockActive = false; });
  await page.getByRole("button", { name: "Опитай отново", exact: true }).click();
  expect((await read(page)).id).toBeTruthy();
  await page.reload();
  await expect(page.locator(".rideRecoveryNotice")).toBeVisible();
});

test("read failure keeps the snapshot and an explicit reload can restore it", async ({ page }) => {
  await fixtures(page); await book(page);
  const original = await read(page);
  await page.addInitScript(key => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(name) { if (name === key && sessionStorage.getItem("allowActiveRead") !== "yes") throw new Error("Read denied"); return get.call(this, name); };
  }, KEY);
  await page.reload();
  await expect(page.getByText("Не успяхме да прочетем активния демо курс от телефона. Презареди, за да опиташ отново.")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("allowActiveRead", "yes"));
  await page.getByRole("button", { name: "Презареди RIVO" }).click();
  await expect(page.locator(".rideRecoveryNotice")).toBeVisible();
  expect((await read(page)).id).toBe(original.id);
});

test("a completed ride never returns even if active-snapshot cleanup fails", async ({ page }) => {
  await fixtures(page); await book(page);
  await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  await page.evaluate(key => {
    const remove = Storage.prototype.removeItem, set = Storage.prototype.setItem;
    Storage.prototype.removeItem = function(name) { if (name === key) throw new Error("Cannot clear"); return remove.call(this, name); };
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new Error("Cannot clear"); return set.call(this, name, value); };
  }, KEY);
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
  await expect(page.getByText(/Не успяхме да изчистим запазения демо курс/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".homeContent")).toBeVisible();
  expect(await read(page)).toBe(null);
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await expect(page.locator(".historyRow")).toHaveCount(1);
});
