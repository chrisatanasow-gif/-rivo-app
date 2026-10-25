import { test, expect } from "@playwright/test";

const MAP_ENGINE = "**/assets/mapEngine-*.js";
const CUSTOMER_SCREEN = "**/assets/ConnectedCustomerApp-*.js";
let client = 0;
async function fixtures(page) {
  if (!process.env.RIVO_E2E_BASE_URL || process.env.RIVO_LOCAL_TEST_SERVER === "1") await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": `198.51.104.${++client}` });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 1800, duration: 300, geometry: { type: "LineString", coordinates: [[23.0379, 42.6052], [23.0422, 42.6048]] } }] } }));
}
async function login(page, name) {
  await page.goto("/ride");
  await page.getByLabel("Твоето име").fill(name);
  await page.getByLabel("Код за вътрешния тест").fill(process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation");
  await page.getByRole("button", { name: "ВЛЕЗ КАТО ПЪТНИК" }).click();
  await expect(page.getByText("Свързано · заявките се обновяват")).toBeVisible();
}
async function create(page) {
  await page.getByRole("button", { name: /Перник, Изток/ }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА", exact: true }).click();
  await page.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
}
async function cancel(page) {
  await page.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Откажи курса", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible();
}

for (const path of ["/ride", "/drive"]) test(`${path} login needs no map, demo, admin or connected-role download`, async ({ page }) => {
  const scripts = [];
  page.on("request", request => { if (request.url().includes("/assets/") && request.url().endsWith(".js")) scripts.push(request.url()); });
  await fixtures(page); await page.goto(path);
  await expect(page.getByLabel("Твоето име")).toBeEditable();
  expect(scripts.some(url => /\/(mapEngine|CustomerApp|DriverApp|AdminApp|ConnectedCustomerApp|ConnectedDriverApp)-/.test(url))).toBe(false);
  const ready = page.getByRole("button", { name: path === "/drive" ? "Шофьор" : "Пътник", exact: true });
  await expect(ready).toHaveAttribute("aria-pressed", "true");
});

test("a slow map never blocks pricing and cannot create a map after its screen is closed", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixtures(page);
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route(MAP_ENGINE, async route => { await pending; await route.continue(); });
  try {
    await login(page, "Бавна карта");
    await expect(page.getByText("Зареждаме картата…", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Перник, Изток/ }).click();
    await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Детайли за курса" })).toBeVisible();
    await expect(page.getByTestId("fare-total")).toHaveText(/2,26/);
    release();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".mapLoadingState")).toHaveCount(0);
    await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCSS("background-color", "rgba(7, 7, 8, 0.7)");
    expect(errors).toEqual([]);
  } finally { release(); }
});

for (const failure of ["map", "screen"]) test(`${failure} download failure recovers the same saved request without resubmitting`, async ({ page }) => {
  await fixtures(page);
  let creates = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("action=create")) creates++; });
  await login(page, `Възстановяване ${failure}`); await create(page);
  const number = await page.getByTestId("ride-number").innerText();
  const fare = await page.getByTestId("fare-total").innerText();
  const pattern = failure === "map" ? MAP_ENGINE : CUSTOMER_SCREEN;
  await page.route(pattern, route => route.abort("failed"));
  await page.reload();
  if (failure === "map") {
    await expect(page.locator(".mapUnavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА", exact: true })).toBeEnabled();
  } else await expect(page.getByRole("heading", { name: "Не успяхме да заредим екрана" })).toBeVisible();
  await page.unroute(pattern);
  await page.getByRole("button", { name: failure === "map" ? "ЗАРЕДИ ОТНОВО" : "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await expect(page.getByTestId("ride-number")).toHaveText(number);
  await expect(page.getByTestId("fare-total")).toHaveText(fare);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect(creates).toBe(1); await cancel(page);
});

test("demo driver and control load only when selected and returning keeps the profile", async ({ page }) => {
  await fixtures(page);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.6052, longitude: 23.0379 });
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: { name: "Перник", lat: "42.6052", lon: "23.0379", address: { city: "Перник" } } }));
  const scripts = []; page.on("request", request => { if (request.url().endsWith(".js")) scripts.push(request.url()); });
  await page.goto("/"); await page.getByRole("button", { name: "Отвори профила" }).click();
  await page.getByLabel("Твоето име").fill("Крис"); await page.getByRole("button", { name: "Запази името", exact: true }).click();
  expect(scripts.some(url => /\/(DriverApp|AdminApp|PilotApp|ConnectedCustomerApp|ConnectedDriverApp)-/.test(url))).toBe(false);
  await page.getByRole("button", { name: /RIVO Driver Шофьорско приложение/ }).click();
  await expect(page.getByRole("heading", { name: "Здравей, Иван" })).toBeVisible();
  expect(scripts.some(url => /\/DriverApp-/.test(url))).toBe(true);
  expect(scripts.some(url => /\/AdminApp-/.test(url))).toBe(false);
  await page.getByRole("button", { name: "КЪМ КЛИЕНТСКОТО ПРИЛОЖЕНИЕ", exact: true }).click();
  await page.getByRole("button", { name: "Отвори профила" }).click(); await expect(page.getByLabel("Твоето име")).toHaveValue("Крис");
  await page.getByRole("button", { name: /RIVO Control Администрация/ }).click();
  await expect(page.getByRole("heading", { name: "Контролен център" })).toBeVisible();
  expect(scripts.some(url => /\/AdminApp-/.test(url))).toBe(true);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Здравей, Крис" })).toBeVisible();
});
