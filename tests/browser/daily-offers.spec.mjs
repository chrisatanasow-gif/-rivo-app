import { test, expect } from "@playwright/test";
import { selectDemoSofia } from "./helpers/demo-destination.mjs";
const KEY = "rivoDailyOffersV1";
async function prepare(page) {
  await page.clock.setFixedTime(new Date("2026-10-17T08:00:00Z"));
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.6019, longitude: 23.0334 });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.fulfill({ status: 503, body: "Fixture" }));
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: { name: "Перник", lat: "42.6019", lon: "23.0334" } }));
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 5000, duration: 600, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.3219, 42.6977]] } }] } }));
  await page.goto("/");
}
const openOffers = page => page.getByRole("button", { name: "Известия и оферти", exact: true }).click();
async function review(page) {
  await selectDemoSofia(page);
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ })).toBeEnabled();
}
async function complete(page) {
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
  await page.getByRole("button", { name: /ДЕМО: (ШОФЬОРЪТ ПРИСТИГНА|ЗАПОЧНИ ПЪТУВАНЕТО)/ }).click();
  if (await page.locator(".customerArrival").count()) await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
}

for (const [width, height] of [[320, 568], [390, 844]]) test(`daily offer is explicit, saved in receipt and used once at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await prepare(page);
  const bell = page.getByRole("button", { name: "Известия и оферти", exact: true });
  const profile = page.getByRole("button", { name: "Отвори профила" });
  const [bellBox, profileBox] = await Promise.all([bell.boundingBox(), profile.boundingBox()]);
  expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(profileBox.x);
  expect(profileBox.x + profileBox.width).toBeLessThanOrEqual(width);
  await openOffers(page);
  await expect(page.locator(".dailyOfferCard")).toContainText("до 2 €");
  await page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" }).click();
  await page.reload();
  await review(page);
  await expect(page.locator(".rideCard .price")).toHaveText(/4,05/);
  await expect(page.locator(".fareDiscount")).toContainText(/0,45/);
  await complete(page);
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/4,05/);
  await page.getByRole("button", { name: "+2 €", exact: true }).click();
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/6,05/);
  await page.reload();
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await expect(page.locator(".historyRow")).toContainText(/6,05/);
  await expect(page.locator(".historyRow")).toContainText(/отстъпка 0,45/);
  await page.getByRole("button", { name: "Известия и оферти Дневна оферта и настройки за телефона" }).click();
  await expect(page.getByText("Днешната оферта е използвана")).toBeVisible();
  await expect(page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("in-app offers can be switched off and the preference survives reload", async ({ page }) => {
  await prepare(page);
  await openOffers(page);
  await page.getByRole("checkbox", { name: /Оферта в RIVO/ }).uncheck();
  await page.reload();
  await expect(page.locator(".offerBanner")).toHaveCount(0);
  await openOffers(page);
  await expect(page.getByRole("checkbox", { name: /Оферта в RIVO/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" })).toBeVisible();
});

test("Sofia midnight refreshes the daily offer and expires an old selection", async ({ page }) => {
  await prepare(page);
  await openOffers(page);
  await page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" }).click();
  await page.clock.setFixedTime(new Date("2026-10-17T21:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await review(page);
  await expect(page.locator(".rideCard .price")).toHaveText(/4,50/);
  await expect(page.locator(".appliedOffer")).toHaveCount(0);
  await page.getByRole("button", { name: "Виж днешната оферта" }).click();
  await expect(page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" })).toBeVisible();
});

test("expired notification links open today's offer without applying a discount", async ({ page }) => {
  await prepare(page);
  await page.goto("/?offer=daily-2026-10-16");
  await expect(page.getByText("Отворената оферта е изтекла. Ето днешната.")).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedId, KEY)).toBe(null);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await review(page);
  await expect(page.locator(".rideCard .price")).toHaveText(/4,50/);
});

test("cancelled rides keep the offer available; the confirmed amount survives midnight", async ({ page }) => {
  await prepare(page); await openOffers(page);
  await page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" }).click();
  await review(page);
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO" }).click();
  await page.getByRole("button", { name: "Откажи курса", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Откажи курса", exact: true }).click();
  await expect(page.locator(".homeContent")).toBeVisible();
  await review(page);
  await expect(page.locator(".rideCard .price")).toHaveText(/4,05/);
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO" }).click();
  await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  await page.clock.setFixedTime(new Date("2026-10-17T21:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/4,05/);
});

async function fakePushBrowser(page, denied = false) {
  await page.addInitScript(({ denied }) => {
    window.__permissionRequests = 0;
    const nativeMatch = window.matchMedia.bind(window);
    window.matchMedia = query => query === "(display-mode: standalone)" ? { matches: true } : nativeMatch(query);
    window.PushManager = function() {};
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission: async () => { window.__permissionRequests++; return denied ? "denied" : "granted"; } } });
    const bytes = new Uint8Array(65); bytes[0] = 4;
    const b64 = value => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const subscription = { toJSON: () => ({ endpoint: "https://web.push.apple.com/browser-fixture", keys: { p256dh: b64(bytes), auth: b64(new Uint8Array(16)) } }), unsubscribe: async () => { window.__unsubscribed = true; return true; } };
    const registration = { update: async () => {}, pushManager: { getSubscription: async () => null, subscribe: async () => subscription } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(registration), register: async () => registration, getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } });
  }, { denied });
}

test("push asks permission only on click, persists on the API, sends a test and opts out", async ({ page }) => {
  await fakePushBrowser(page);
  await prepare(page); await openOffers(page);
  await expect(page.getByRole("button", { name: "Включи известията на телефона" })).toBeVisible();
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
  await page.getByRole("button", { name: "Включи известията на телефона" }).click();
  await expect(page.getByText("Абонаментът е включен на това устройство")).toBeVisible();
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(1);
  await page.reload(); await openOffers(page);
  await expect(page.getByText("Абонаментът е включен на това устройство")).toBeVisible();
  await page.getByRole("button", { name: "Изпрати тестово известие" }).click();
  await expect(page.getByText(/Тестовото известие е изпратено/)).toBeVisible();
  await page.getByRole("button", { name: "Изключи известията за оферти" }).click();
  await expect(page.getByText("Известията за оферти са изключени.")).toBeVisible();
  expect(await page.evaluate(() => window.__unsubscribed)).toBe(true);
  await page.reload(); await openOffers(page);
  await expect(page.getByRole("button", { name: "Включи известията на телефона" })).toBeVisible();
});

test("permission refusal keeps the daily offer usable and never subscribes", async ({ page }) => {
  await fakePushBrowser(page, true);
  await prepare(page); await openOffers(page);
  await page.getByRole("button", { name: "Включи известията на телефона" }).click();
  await expect(page.getByText(/Известията са блокирани от настройките/)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pushToken, KEY)).toBe(null);
  await expect(page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" })).toBeEnabled();
});

test("iPhone browser explains installation and a temporary API failure can recover", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/notifications?action=config", route => route.fulfill({ status: 503, json: { error: "Тестова временна грешка" } }));
  await openOffers(page);
  await expect(page.getByRole("alert")).toContainText("Тестова временна грешка");
  await expect(page.getByRole("button", { name: "ИЗПОЛЗВАЙ ОФЕРТАТА" })).toBeEnabled();
  await page.unroute("**/api/notifications?action=config");
  await page.getByRole("button", { name: "Провери отново" }).click();
  await expect(page.getByText(/На iPhone: отвори RIVO в Safari/)).toBeVisible();
  await expect(page.getByText(/Ежедневното изпращане ще започне при публичния старт/)).toBeVisible();
});
