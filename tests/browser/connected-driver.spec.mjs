import { test, expect } from "@playwright/test";

let clientNumber = 0;
const CODE = process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation";
async function login(page, role, name) {
  if (!process.env.RIVO_E2E_BASE_URL) await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": `198.51.102.${++clientNumber}` });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 1800, duration: 300, geometry: { type: "LineString", coordinates: [[23.0379, 42.6052], [23.0422, 42.6048]] } }] } }));
  await page.goto(role === "customer" ? "/ride" : "/drive");
  await page.getByLabel("Твоето име").fill(name);
  if (role === "driver") { await expect(page.getByRole("button", { name: "Шофьор", exact: true })).toHaveAttribute("aria-pressed", "true"); await page.getByLabel("Автомобил", { exact: true }).fill("Skoda Octavia"); await page.getByLabel("Регистрационен номер").fill("PK 2026 AA"); }
  await page.getByLabel("Код за вътрешния тест").fill(CODE);
  await page.getByRole("button", { name: role === "driver" ? "ВЛЕЗ КАТО ШОФЬОР" : "ВЛЕЗ КАТО ПЪТНИК" }).click();
  await expect(page.getByText("Свързано · заявките се обновяват")).toBeVisible();
}
async function create(customer) {
  await customer.getByRole("button", { name: /Перник, Изток/ }).click();
  await customer.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await customer.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА", exact: true }).click();
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА", exact: true }).click();
  await expect(customer.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
}
async function preview(driver, name) { await driver.getByRole("button", { name: `Прегледай заявката на ${name}`, exact: true }).click(); await expect(driver.getByRole("heading", { name: "Прегледай заявката" })).toBeVisible(); }
async function accept(driver, name) { await preview(driver, name); await driver.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА", exact: true }).click(); await expect(driver.getByRole("heading", { name: "Към клиента", exact: true })).toBeVisible(); }
async function cancel(driver) { await driver.getByRole("button", { name: "ОТКАЖИ КУРСА", exact: true }).click(); await driver.getByRole("dialog").getByRole("button", { name: "Откажи курса", exact: true }).click(); await expect(driver.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible(); }
async function pinned(page, name) {
  const button = page.getByRole("button", { name, exact: true }); const before = await button.boundingBox();
  expect(before.height).toBeGreaterThanOrEqual(44); expect(before.y + before.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.locator(".driverContent").evaluate(el => el.scrollTop = el.scrollHeight);
  const after = await button.boundingBox(); expect(after.y).toBeCloseTo(before.y, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("both connected designs finish one shared course, preserving GPS, fare and the arrival timer", async ({ browser }) => {
  const cc = await browser.newContext(), dc = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 42.61, longitude: 23.05, accuracy: 12 } });
  const customer = await cc.newPage(), driver = await dc.newPage();
  await driver.addInitScript(() => { const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation); navigator.geolocation.watchPosition = (...args) => { window.__watchCount = (window.__watchCount || 0) + 1; return watch(...args); }; });
  const name = `Свързан шофьор ${Date.now()}`;
  await login(customer, "customer", name); await login(driver, "driver", "Шофьор Дизайн"); await create(customer); await accept(driver, name);
  await expect(driver.getByTestId("driver-fare-total")).toHaveText(/2,26/);
  const number = await driver.getByTestId("driver-ride-number").innerText();
  await expect(driver.getByRole("link", { name: "Отвори навигация" })).toHaveAttribute("href", /destination=42\.6052,23\.0379/);
  await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click();
  await expect(customer.getByRole("img", { name: "GPS позиция на шофьора", exact: true })).toBeVisible();
  await driver.getByRole("button", { name: "ПРИСТИГНАХ ПРИ КЛИЕНТА" }).click();
  await expect(customer.locator(".header .pill")).toHaveText("ПРИСТИГНАЛ");
  await expect(driver.getByRole("timer")).not.toHaveText("00:00");
  const elapsed = (await driver.getByRole("timer").innerText()).split(":").reduce((m, s) => m * 60 + Number(s), 0);
  await driver.reload(); await expect(driver.getByRole("timer")).toBeVisible();
  const restored = (await driver.getByRole("timer").innerText()).split(":").reduce((m, s) => m * 60 + Number(s), 0);
  expect(restored).toBeGreaterThanOrEqual(elapsed);
  await expect(driver.getByTestId("driver-ride-number")).toHaveText(number);
  await dc.setGeolocation({ latitude: 42.611, longitude: 23.051, accuracy: 8 });
  await expect(driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" })).toBeVisible(); await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click();
  await expect(customer.getByRole("img", { name: "GPS позиция на шофьора", exact: true })).toHaveAttribute("data-latitude", "42.611");
  await driver.getByRole("button", { name: "СТАРТИРАЙ КУРСА" }).click();
  await expect(driver.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  await expect(customer.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  expect(await driver.evaluate(() => window.__watchCount)).toBe(1);
  await expect(driver.getByRole("link", { name: "Отвори навигация" })).toHaveAttribute("href", /destination=42\.6048,23\.0422/);
  await expect(driver.getByRole("button", { name: "ОТКАЖИ КУРСА", exact: true })).toHaveCount(0);
  await driver.getByRole("button", { name: "ЗАВЪРШИ КУРСА", exact: true }).click();
  await expect(driver.getByRole("dialog")).toBeVisible(); await driver.keyboard.press("Escape");
  await expect(customer.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  await driver.getByRole("button", { name: "ЗАВЪРШИ КУРСА", exact: true }).click();
  await driver.getByRole("dialog").getByRole("button", { name: "Завърши курса", exact: true }).click();
  await expect(driver.getByRole("heading", { name: "Курсът е завършен" })).toBeVisible();
  await expect(customer.getByRole("heading", { name: "Курсът е завършен" })).toBeVisible();
  await expect(driver.getByTestId("driver-fare-total")).toHaveText(/2,26/);
  await driver.getByRole("button", { name: "КЪМ ЗАЯВКИТЕ", exact: true }).click(); await driver.reload();
  await expect(driver.getByRole("heading", { name: "Здравей, Шофьор Дизайн" })).toBeVisible();
  await driver.getByRole("button", { name: "История", exact: true }).click();
  await expect(driver.locator(".connectedDriverHistory")).toHaveCount(1); await expect(driver.locator(".connectedDriverHistory")).toContainText("2,26");
  await cc.close(); await dc.close();
});

test("another driver taking a previewed request disables acceptance and cancellation reaches the customer", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [customer, a, b] = await Promise.all(contexts.map(context => context.newPage())); const name = `Състезание ${Date.now()}`;
  await login(customer, "customer", name); await login(a, "driver", "Шофьор А"); await login(b, "driver", "Шофьор Б"); await create(customer);
  await preview(a, name); await preview(b, name);
  await a.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Към клиента", exact: true })).toBeVisible();
  await expect(b.getByRole("heading", { name: "Заявката вече не е налична" })).toBeVisible();
  await expect(b.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА", exact: true })).toBeDisabled();
  await a.getByRole("button", { name: "ОТКАЖИ КУРСА", exact: true }).click();
  await expect(a.getByRole("dialog")).toContainText("ще трябва да заяви нов курс"); await a.keyboard.press("Escape");
  await cancel(a); await expect(customer.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible();
  await Promise.all(contexts.map(context => context.close()));
});

test("a connection error blocks driver actions and an active passenger cannot silently switch roles", async ({ browser }) => {
  const cc = await browser.newContext(), dc = await browser.newContext(); const customer = await cc.newPage(), driver = await dc.newPage(); const name = `Връзка ${Date.now()}`;
  await login(customer, "customer", name); await login(driver, "driver", "Шофьор Връзка"); await create(customer);
  await customer.goto("/drive"); await expect(customer.getByRole("heading", { name: "Влязъл си като пътник" })).toBeVisible();
  await expect(customer.getByRole("button", { name: "ИЗЛЕЗ И СМЕНИ РОЛЯТА" })).toBeDisabled(); await customer.getByRole("link", { name: "Към твоето приложение" }).click();
  await expect(customer.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await accept(driver, name);
  await driver.route("**/api/pilot?action=state", route => route.fulfill({ status: 503, json: { error: "Тестово прекъсване" } }));
  await driver.getByRole("button", { name: "Обнови заявките" }).click(); await expect(driver.getByText("Тестово прекъсване")).toBeVisible();
  await expect(driver.getByRole("button", { name: "ПРИСТИГНАХ ПРИ КЛИЕНТА" })).toBeDisabled();
  await driver.unroute("**/api/pilot?action=state"); await driver.getByRole("button", { name: "Обнови заявките" }).click();
  await expect(driver.getByRole("button", { name: "ПРИСТИГНАХ ПРИ КЛИЕНТА" })).toBeEnabled(); await cancel(driver);
  await customer.goto("/drive"); await customer.getByRole("button", { name: "ИЗЛЕЗ И СМЕНИ РОЛЯТА" }).click();
  await expect(customer.getByRole("button", { name: "Шофьор", exact: true })).toHaveAttribute("aria-pressed", "true");
  await cc.close(); await dc.close();
});

for (const [width, height] of [[320, 568], [430, 932]]) {
  test(`driver review and course actions remain pinned at ${width}×${height}`, async ({ browser }) => {
    const cc = await browser.newContext(), dc = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const customer = await cc.newPage(), driver = await dc.newPage(); const name = `Екран шофьор ${width}`;
    await login(customer, "customer", name); await login(driver, "driver", `Шофьор ${width}`); await create(customer); await preview(driver, name);
    await pinned(driver, "ПРИЕМИ ЗАЯВКАТА"); await driver.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА", exact: true }).click();
    await pinned(driver, "ПРИСТИГНАХ ПРИ КЛИЕНТА"); await driver.getByRole("button", { name: "ПРИСТИГНАХ ПРИ КЛИЕНТА" }).click();
    await pinned(driver, "СТАРТИРАЙ КУРСА"); await driver.getByRole("button", { name: "СТАРТИРАЙ КУРСА" }).click();
    await pinned(driver, "ЗАВЪРШИ КУРСА"); await driver.getByRole("button", { name: "ЗАВЪРШИ КУРСА", exact: true }).click();
    const confirm = driver.getByRole("dialog").getByRole("button", { name: "Завърши курса", exact: true });
    const box = await confirm.boundingBox(); expect(box.y + box.height).toBeLessThanOrEqual(height); await confirm.click();
    await pinned(driver, "КЪМ ЗАЯВКИТЕ"); await cc.close(); await dc.close();
  });
}
