import { test, expect } from "@playwright/test";

const CODE = process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation";
let testClient = 0;
async function fixtures(page) {
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://router.project-osrm.org/**", route => {
    const coordinates = new URL(route.request().url()).pathname.split("/").at(-1).split(";").map(point => point.split(",").map(Number));
    // Deliberately different from the server's 1.8 km / €2.26 fixture.
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: 99000, duration: 3000, geometry: { type: "LineString", coordinates } }] } });
  });
}
async function login(page, role, name) {
  // Separate local clients must not consume the old suite's per-address login quota.
  if (!process.env.RIVO_E2E_BASE_URL) await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": `198.51.100.${++testClient}` });
  await fixtures(page);
  await page.goto(role === "customer" ? "/ride" : "/pilot?role=driver");
  await page.getByLabel("Твоето име").fill(name);
  if (role === "driver") {
    await page.getByLabel("Автомобил", { exact: true }).fill("Skoda Octavia");
    await page.getByLabel("Регистрационен номер").fill("PK 5678 AA");
  }
  await page.getByLabel("Код за вътрешния тест").fill(CODE);
  await page.getByRole("button", { name: role === "driver" ? "ВЛЕЗ КАТО ШОФЬОР" : "ВЛЕЗ КАТО ПЪТНИК" }).click();
  await expect(page.getByText("Свързано · заявките се обновяват")).toBeVisible();
}
async function review(page) {
  await page.getByRole("combobox", { name: "Дестинация", exact: true }).fill("епи");
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
  await page.getByRole("button", { name: "Добави пътник" }).click();
  await page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА" }).click();
  await expect(page.getByRole("heading", { name: "Потвърди заявката" })).toBeVisible();
}
async function cancel(page) {
  await page.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Откажи курса", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible();
}

test("connected design uses the server fare and follows only the real driver's lifecycle", async ({ browser }) => {
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const dc = await browser.newContext();
  const customer = await cc.newPage(), driver = await dc.newPage();
  const name = `Свързан клиент ${Date.now()}`;
  let creates = 0;
  customer.on("request", request => { if (request.method() === "POST" && request.url().includes("action=create")) creates++; });
  await login(customer, "customer", name); await login(driver, "driver", "Истински тестов шофьор");
  await review(customer);
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await expect(customer.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await expect(customer.getByText("2 пътници", { exact: true })).toBeVisible();
  const number = await customer.getByTestId("ride-number").innerText();
  await customer.reload();
  await expect(customer.getByTestId("ride-number")).toHaveText(number);
  await driver.locator(".pilotRequest").filter({ hasText: name }).getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът прие" })).toBeVisible();
  await expect(customer.locator(".header .pill")).toHaveText("ШОФЬОРЪТ ИДВА");
  await expect(customer.getByText("PK 5678 AA", { exact: true })).toBeVisible();
  await expect(customer.locator(".driverProfile")).not.toContainText(/4\.9|248/);
  await driver.getByRole("button", { name: "ПРИСТИГНАХ", exact: true }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът пристигна" })).toBeVisible();
  await expect(customer.locator(".header .pill")).toHaveText("ПРИСТИГНАЛ");
  await cc.setOffline(true);
  await expect(customer.getByText(/Няма връзка/)).toBeVisible();
  await expect(customer.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" })).toBeDisabled();
  await driver.getByRole("button", { name: "СТАРТИРАЙ КУРСА" }).click();
  await cc.setOffline(false);
  await expect(customer.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  await expect(customer.locator(".header .pill")).toHaveText("В ДВИЖЕНИЕ");
  await expect(customer.getByRole("button", { name: /ОТКАЖИ|СТАРТИРАЙ|ДЕМО:|ЗАВЪРШИ/ })).toHaveCount(0);
  await Promise.all([customer.reload(), driver.reload()]);
  await expect(customer.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  await expect(customer.getByTestId("fare-total")).toHaveText(/2,26/);
  await expect(driver.locator(".pilotRideHeading .price")).toHaveText(/2,26/);
  await driver.getByRole("button", { name: "ЗАВЪРШИ КУРСА" }).click();
  await expect(customer.getByRole("heading", { name: "Курсът е завършен" })).toBeVisible();
  await customer.getByRole("button", { name: "НОВА ЗАЯВКА" }).click();
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Къде отиваме?" })).toBeVisible();
  await customer.getByRole("button", { name: "Общи заявки", exact: true }).click();
  await expect(customer.getByText("Бар Епицентър", { exact: false })).toBeVisible();
  await expect(customer.getByText("Курсът е завършен", { exact: true })).toBeVisible();
  expect(creates).toBe(1);
  await cc.close(); await dc.close();
});

test("a lost create response recovers the saved request and cancellation requires confirmation", async ({ page }) => {
  await login(page, "customer", `Повторение ${Date.now()}`); await review(page);
  let saved;
  await page.route("**/api/pilot?action=create", async route => {
    const response = await route.fetch(); saved = await response.json();
    await route.fulfill({ status: 503, json: { error: "Потвърждението не се получи. Опитай отново." } });
  });
  await page.route("**/api/pilot?action=state", route => route.fulfill({ status: 503, json: { error: "Временно прекъсване" } }));
  await page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await expect(page.getByText("Потвърждението не се получи. Опитай отново.")).toBeVisible();
  await page.unroute("**/api/pilot?action=create");
  await page.unroute("**/api/pilot?action=state");
  // Recover the already saved request from the server rather than creating a new one.
  await page.getByRole("button", { name: "Обнови заявките" }).click();
  await expect(page.getByTestId("ride-number")).toHaveText(`Заявка № ${saved.ride.id.slice(0, 8).toUpperCase()}`);
  await page.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" }).click();
  await expect(page.getByRole("dialog")).toContainText("Все още търсим шофьор");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await cancel(page);
});

test("route errors and an unselected address block progressing with an old price", async ({ page }) => {
  await login(page, "customer", `Ценова грешка ${Date.now()}`);
  await page.route("**/api/pilot?action=quote", route => route.fulfill({ status: 503, json: { error: "Маршрутът временно не е наличен." } }));
  await page.getByRole("button", { name: /Перник, Изток/ }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByText("Маршрутът временно не е наличен.")).toBeVisible();
  await expect(page.getByTestId("fare-total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА" })).toBeDisabled();
  await page.unroute("**/api/pilot?action=quote");
  await page.getByRole("button", { name: "Изчисли отново" }).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("combobox", { name: "Дестинация", exact: true }).fill("неизбран адрес");
  await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeDisabled();
});

test("failed submission keeps its idempotency key and an expired quote requires recalculation", async ({ page }) => {
  await page.clock.install();
  await login(page, "customer", `Повторно изпращане ${Date.now()}`); await review(page);
  const bodies = [];
  await page.route("**/api/pilot?action=create", async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.fulfill({ status: 503, json: { error: "Опитай да изпратиш отново." } });
    return route.continue();
  });
  await page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await expect(page.getByText("Опитай да изпратиш отново.")).toBeVisible();
  await page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await expect(page.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey);
  await cancel(page);
  const nextQuote = page.waitForResponse(response => response.url().includes("action=quote"));
  await page.getByRole("button", { name: "НОВА ЗАЯВКА" }).click();
  await nextQuote;
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
  await page.clock.fastForward(6 * 60 * 1000);
  await expect(page.getByTestId("fare-total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА" })).toBeDisabled();
  // Restore the real clock: the API signs quotes against server time.
  await page.clock.setSystemTime(new Date());
  await page.getByRole("button", { name: "Изчисли отново" }).click();
  await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
});

for (const [width, height] of [[320, 568], [430, 932]]) {
  test(`connected booking actions remain visible at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await login(page, "customer", `Екран ${width}`); await review(page);
    const button = page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" });
    const box = await button.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
