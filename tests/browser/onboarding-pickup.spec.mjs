import { test, expect } from "@playwright/test";

let accountNumber = 0;
const select = (page, field) => page.getByRole("combobox", { name: field, exact: true });
const gpsButton = page => page.getByRole("button", { name: "ИЗПОЛЗВАЙ МОЕТО МЯСТО", exact: true });
const next = page => page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true });
const address = { lat: "42.6199", lon: "23.0599", address: { road: "улица Тестова", house_number: "12", city: "Перник" } };
async function providers(page) {
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: address }));
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 1800, duration: 300, geometry: { type: "LineString", coordinates: [[23.05, 42.61], [23.0422, 42.6048]] } }] } }));
}
async function login(page, path = "/account/ride") {
  await providers(page);
  await page.goto(path);
  await page.getByLabel("Имейл", { exact: true }).fill(`onboard-pickup-${++accountNumber}@example.invalid`);
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await page.getByLabel("Код от имейла").fill("123456");
  await page.getByRole("button", { name: "ВЛЕЗ В RIVO" }).click();
  await expect(page.getByRole("heading", { name: "Как да те наричаме?" })).toBeVisible();
  await expect(page.getByLabel("Име по документи", { exact: true })).toHaveCount(0);
  await page.getByLabel("Твоето име", { exact: true }).fill("Пътник Начало");
  await page.getByRole("button", { name: "ЗАПАЗИ И ПРОДЪЛЖИ" }).click();
  await expect(page.getByRole("heading", { name: path === "/account/ride" ? "Къде отиваме?" : path === "/account/drive" ? "Карай с RIVO" : "Здравей, Пътник Начало." })).toBeVisible();
}
async function destination(page) {
  await select(page, "Дестинация").fill("епи");
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
}
async function readyQuote(page) {
  await destination(page); await next(page).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
}
async function pinned(page, locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [320, 390]) test(`first sign-in keeps the requested customer route and the compact profile at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = () => { window.__gpsCalls = (window.__gpsCalls || 0) + 1; }; });
  let quotes = 0;
  page.on("request", r => { if (r.url().includes("/api/member-rides?action=quote")) quotes++; });
  await login(page);
  await expect(select(page, "Взимане")).toHaveValue("");
  expect(await page.evaluate(() => window.__gpsCalls || 0)).toBe(0);
  await destination(page); await expect(next(page)).toBeDisabled(); expect(quotes).toBe(0);
  await page.getByRole("link", { name: "Моят профил", exact: true }).click();
  await expect(page.getByLabel("Име по документи", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Твоето име", { exact: true })).toHaveCount(0);
  await pinned(page, page.getByRole("link", { name: "ПОРЪЧАЙ RIVO", exact: true }));
  await page.screenshot({ path: info.outputPath(`profile-${width}.png`) });
  await page.getByRole("button", { name: "Редактирай името", exact: true }).click();
  await page.getByLabel("Твоето име", { exact: true }).fill("Пътник Ново Име");
  await page.getByRole("button", { name: "ЗАПАЗИ ПРОФИЛА", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Здравей, Пътник Ново Име." })).toBeVisible();
  await expect(page.getByLabel("Твоето име", { exact: true })).toHaveCount(0);
});

test("a driver's direct sign-in opens the application only after name completion", async ({ page }) => {
  await login(page, "/account/drive");
  await expect(page.getByLabel("Име по документи", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Към профила", exact: true }).click();
  await expect(page.getByLabel("Име по документи", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Карай с RIVO/ }).click();
  await expect(page.getByRole("heading", { name: "Карай с RIVO" })).toBeVisible();
});

test("a temporary profile failure cannot masquerade as a signed-out session", async ({ page }) => {
  await login(page, "/account");
  for (const failure of ["server", "network", "html"]) {
    await page.route("**/api/account?action=profile", route => failure === "network" ? route.abort("failed") : failure === "html" ? route.fulfill({ status: 502, contentType: "text/html", body: "temporary proxy error" }) : route.fulfill({ status: 503, json: { error: "Профилът временно не е достъпен." } }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Да възстановим връзката." })).toBeVisible();
    await expect(page.getByLabel("Имейл", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("alert")).not.toContainText(/Failed to fetch|Unexpected token|TypeError/);
    await page.unroute("**/api/account?action=profile");
    await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Здравей, Пътник Начало." })).toBeVisible();
  }
});

test("auth transport failure and rate limiting keep the email and show Bulgarian recovery", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Имейл", { exact: true }).fill("onboard-auth-recovery@example.invalid");
  await page.route("**/api/auth/email-otp/send-verification-otp", route => route.abort("failed"));
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await expect(page.getByRole("alert")).toContainText("Няма връзка с входа на RIVO");
  await expect(page.getByLabel("Имейл", { exact: true })).toHaveValue("onboard-auth-recovery@example.invalid");
  await page.unroute("**/api/auth/email-otp/send-verification-otp");
  await page.route("**/api/auth/email-otp/send-verification-otp", route => route.fulfill({ status: 429, json: { code: "TOO_MANY_REQUESTS", message: "Too many requests" } }));
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await expect(page.getByRole("alert")).toContainText("Твърде много опити");
  await expect(page.getByLabel("Имейл", { exact: true })).toHaveValue("onboard-auth-recovery@example.invalid");
});

test("an accepted OTP survives a failed profile load without reusing the consumed code", async ({ page }) => {
  await providers(page); await page.goto("/account/ride");
  await page.getByLabel("Имейл", { exact: true }).fill("onboard-after-otp@example.invalid");
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await page.getByLabel("Код от имейла").fill("123456");
  let unavailable = true, verifications = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/auth/sign-in/email-otp")) verifications++; });
  await page.route("**/api/account?action=profile", route => unavailable && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: "Временна грешка при профила." } }) : route.continue());
  await page.getByRole("button", { name: "ВЛЕЗ В RIVO" }).click();
  await expect(page.getByRole("heading", { name: "Да възстановим връзката." })).toBeVisible();
  await expect(page.getByLabel("Код от имейла")).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Как да те наричаме?" })).toBeVisible();
  unavailable = true;
  await page.getByLabel("Твоето име", { exact: true }).fill("Възстановен Пътник");
  await page.getByRole("button", { name: "ЗАПАЗИ И ПРОДЪЛЖИ" }).click();
  await expect(page.getByRole("heading", { name: "Къде отиваме?" })).toBeVisible();
  expect(verifications).toBe(1);
  await expect(select(page, "Взимане")).toHaveValue("");
});

test("GPS keeps exact measured coordinates through address lookup, quote and create", async ({ page, context }, info) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 42.61, longitude: 23.05, accuracy: 12 });
  await login(page); await gpsButton(page).click();
  await expect(select(page, "Взимане")).toHaveValue("улица Тестова 12");
  await expect(page.locator(".pickupLocationHint")).toContainText("точност около 12 м");
  await page.screenshot({ path: info.outputPath("gps-pickup.png") });
  const quoted = page.waitForRequest(r => r.url().includes("/api/member-rides?action=quote") && r.method() === "POST");
  await readyQuote(page);
  expect((await quoted).postDataJSON().pickup).toMatchObject({ lat: 42.61, lng: 23.05 });
  await page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА", exact: true }).click();
  const created = page.waitForRequest(r => r.url().includes("/api/member-rides?action=create") && r.method() === "POST");
  await page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА", exact: true }).click();
  expect((await created).postDataJSON().pickup).toMatchObject({ lat: 42.61, lng: 23.05 });
  await expect(page.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
});

test("denied GPS leaves pickup unset and manual selection stays available", async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_success, fail) => fail({ code: 1 }); });
  await login(page); await gpsButton(page).click();
  await expect(page.locator(".pickupLocationHint")).toContainText("отказан");
  await expect(select(page, "Взимане")).toHaveValue("");
  await destination(page); await expect(next(page)).toBeDisabled();
  await select(page, "Взимане").focus();
  await page.getByRole("button", { name: /Перник, Изток/ }).click();
  await expect(next(page)).toBeEnabled(); await next(page).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
});

test("inaccurate GPS preserves an explicitly chosen pickup", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 42.61, longitude: 23.05, accuracy: 900 });
  await login(page);
  await page.getByRole("button", { name: /Перник, Изток/ }).click();
  await gpsButton(page).click();
  await expect(page.locator(".pickupLocationHint")).toContainText("твърде неточно");
  await expect(select(page, "Взимане")).toHaveValue("Перник, Изток");
});

test("late GPS and a cancelled lookup cannot overwrite a manual choice", async ({ page }) => {
  await page.addInitScript(() => { window.__gpsCallbacks = []; navigator.geolocation.getCurrentPosition = success => window.__gpsCallbacks.push(success); });
  await login(page); await gpsButton(page).click();
  await page.getByRole("button", { name: /Перник, Изток/ }).click();
  const resolve = index => page.evaluate(index => window.__gpsCallbacks[index]({ coords: { latitude: 42.61, longitude: 23.05, accuracy: 12 }, timestamp: Date.now() }), index);
  await resolve(0); await expect(select(page, "Взимане")).toHaveValue("Перник, Изток");
  await gpsButton(page).click(); await page.getByRole("button", { name: "ОТКАЖИ ЛОКАЛИЗИРАНЕТО", exact: true }).click();
  await resolve(1); await expect(select(page, "Взимане")).toHaveValue("Перник, Изток");
  await expect(gpsButton(page)).toBeEnabled();
});

test("late reverse lookup cannot replace the customer's newer pickup", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 42.61, longitude: 23.05, accuracy: 12 });
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  await login(page);
  await page.route("https://nominatim.openstreetmap.org/reverse?*", async route => { started(); await new Promise(resolve => { release = resolve; }); await route.fulfill({ json: address }); });
  await gpsButton(page).click(); await began;
  await page.getByRole("button", { name: /Перник, Изток/ }).click(); release();
  await expect(select(page, "Взимане")).toHaveValue("Перник, Изток");
  await destination(page); await next(page).click(); await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
});

test("a street-name provider failure keeps the measured point usable", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 42.61, longitude: 23.05, accuracy: 12 });
  await login(page);
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ status: 503, json: {} }));
  await gpsButton(page).click(); await expect(select(page, "Взимане")).toHaveValue("Текущото ми място");
  await readyQuote(page);
});
