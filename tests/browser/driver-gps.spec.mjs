import { test, expect } from "@playwright/test";

let nextClient = 0;
const CODE = process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation";
async function login(page, role, name) {
  if (!process.env.RIVO_E2E_BASE_URL || process.env.RIVO_LOCAL_TEST_SERVER === "1") await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": `198.51.101.${++nextClient}` });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 1800, duration: 300, geometry: { type: "LineString", coordinates: [[23.0379, 42.6052], [23.0422, 42.6048]] } }] } }));
  await page.goto(role === "driver" ? "/pilot?role=driver" : "/ride");
  await page.getByLabel("Твоето име").fill(name);
  if (role === "driver") { await page.getByLabel("Автомобил", { exact: true }).fill("Skoda GPS"); await page.getByLabel("Регистрационен номер").fill("GPS 1234"); }
  await page.getByLabel("Код за вътрешния тест").fill(CODE);
  await page.getByRole("button", { name: role === "driver" ? "ВЛЕЗ КАТО ШОФЬОР" : "ВЛЕЗ КАТО ПЪТНИК" }).click();
  await expect(page.getByText("Свързано · заявките се обновяват")).toBeVisible();
}
async function createAndAccept(customer, driver, name) {
  await customer.getByRole("button", { name: /Перник, Изток/ }).click();
  await customer.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await customer.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА", exact: true }).click();
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА", exact: true }).click();
  await driver.locator(".pilotRequest").filter({ hasText: name }).getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът прие" })).toBeVisible();
}
async function end(customer, driver) {
  await driver.getByRole("button", { name: "ОТКАЖИ КУРСА", exact: true }).click();
  await expect(customer.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible();
}
async function watchCount(page) { return page.evaluate(() => window.__rivoWatchCount || 0); }
const marker = page => page.getByRole("img", { name: "GPS позиция на шофьора", exact: true });

test("GPS starts on consent, follows real coordinates, stops explicitly and never restarts on reload", async ({ browser }) => {
  const cc = await browser.newContext(), dc = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 42.61, longitude: 23.05, accuracy: 12 } });
  const customer = await cc.newPage(), driver = await dc.newPage();
  await driver.addInitScript(() => {
    const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (...args) => { window.__rivoWatchCount = (window.__rivoWatchCount || 0) + 1; return watch(...args); };
  });
  const name = `GPS движение ${Date.now()}`;
  let sends = 0; driver.on("request", request => { if (request.url().includes("action=position")) sends++; });
  await login(customer, "customer", name); await login(driver, "driver", "GPS шофьор");
  await createAndAccept(customer, driver, name);
  expect(await watchCount(driver)).toBe(0);
  await expect(marker(customer)).toHaveCount(0);
  await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click();
  await expect(marker(customer)).toHaveAttribute("data-latitude", "42.61");
  await expect(marker(customer)).toHaveAttribute("data-longitude", "23.05");
  await expect(customer.getByTestId("driver-location-status")).toContainText("точност ~12 м");
  await customer.getByRole("button", { name: "Покажи шофьора" }).click();
  await dc.setGeolocation({ latitude: 42.65, longitude: 23.1, accuracy: 900 });
  await expect(driver.getByText(/GPS точността е недостатъчна/)).toBeVisible();
  await expect(marker(customer)).toHaveAttribute("data-latitude", "42.61");
  await dc.setGeolocation({ latitude: 42.612, longitude: 23.052, accuracy: 8 });
  await expect(marker(customer)).toHaveAttribute("data-latitude", "42.612");
  await expect(customer.getByTestId("fare-total")).toHaveText(/2,26/);
  await driver.getByRole("button", { name: "СПРИ GPS СПОДЕЛЯНЕТО" }).click();
  await expect(marker(customer)).toHaveCount(0);
  await expect(customer.getByTestId("driver-location-status")).toContainText("не споделя");
  const stoppedSends = sends;
  await dc.setGeolocation({ latitude: 42.613, longitude: 23.053 });
  await driver.reload();
  await expect(driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" })).toBeVisible();
  expect(await watchCount(driver)).toBe(0); expect(sends).toBe(stoppedSends);
  await end(customer, driver); await cc.close(); await dc.close();
});

test("hidden GPS pauses and an old point becomes visibly stale, then disappears", async ({ browser }) => {
  const cc = await browser.newContext(), dc = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 42.61, longitude: 23.05, accuracy: 15 } });
  const customer = await cc.newPage(), driver = await dc.newPage();
  await customer.clock.install();
  const name = `GPS пауза ${Date.now()}`;
  await login(customer, "customer", name); await login(driver, "driver", "GPS пауза шофьор"); await createAndAccept(customer, driver, name);
  await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click(); await expect(marker(customer)).toBeVisible();
  await driver.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(driver.getByText("Споделянето е на пауза", { exact: true })).toBeVisible();
  await customer.clock.fastForward(25000);
  await expect(customer.getByTestId("driver-location-status")).toContainText("Последна позиция");
  await expect(customer.locator(".rivoDriverMarker.isStale")).toBeVisible();
  await customer.clock.fastForward(100000);
  await expect(customer.locator(".rivoDriverMarker")).toHaveCount(0);
  await expect(customer.getByTestId("driver-location-status")).toContainText("Изчакваме актуална");
  await customer.clock.setSystemTime(new Date());
  await driver.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(marker(customer)).toBeVisible();
  await end(customer, driver); await cc.close(); await dc.close();
});

test("denied GPS stays truthful and a failed stop has a retry while local tracking stops", async ({ browser }) => {
  const cc = await browser.newContext(), dc = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 42.61, longitude: 23.05, accuracy: 15 } });
  const customer = await cc.newPage(), driver = await dc.newPage();
  const name = `GPS отказ ${Date.now()}`;
  await login(customer, "customer", name); await login(driver, "driver", "GPS отказ шофьор"); await createAndAccept(customer, driver, name);
  await driver.evaluate(() => {
    window.__realWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (_success, failure) => { queueMicrotask(() => failure({ code: 1 })); return 999; };
  });
  await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click();
  await expect(driver.getByText(/Достъпът до GPS е отказан/)).toBeVisible();
  await expect(marker(customer)).toHaveCount(0);
  await driver.evaluate(() => { navigator.geolocation.watchPosition = window.__realWatch; });
  await expect(driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" })).toBeVisible();
  await driver.getByRole("button", { name: "СПОДЕЛИ GPS ПОЗИЦИЯ" }).click(); await expect(marker(customer)).toBeVisible();
  await driver.route("**/api/pilot?action=tracking", route => route.request().postDataJSON().command === "stop"
    ? route.fulfill({ status: 503, json: { error: "Тестов отказ при спиране" } }) : route.continue());
  await driver.getByRole("button", { name: "СПРИ GPS СПОДЕЛЯНЕТО" }).click();
  await expect(driver.getByText(/изчистването при клиента не е потвърдено/)).toBeVisible();
  await driver.unroute("**/api/pilot?action=tracking");
  await driver.getByRole("button", { name: "ОПИТАЙ ДА СПРЕШ ОТНОВО" }).click();
  await expect(marker(customer)).toHaveCount(0);
  await end(customer, driver); await cc.close(); await dc.close();
});
