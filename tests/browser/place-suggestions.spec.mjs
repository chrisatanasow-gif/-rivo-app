import { test, expect } from "@playwright/test";

const photonPlace = (name, lat = 42.604, lng = 23.027, id = 10) => ({
  type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { name, city: "Перник", street: "Кракра", housenumber: "10", countrycode: "BG", osm_type: "N", osm_id: id }
});

async function prepare(page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.6019, longitude: 23.0334 });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.fulfill({ status: 503, body: "Map unavailable in isolated suggestion tests" }));
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: { name: "Перник", lat: "42.6019", lon: "23.0334" } }));
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://router.project-osrm.org/**", route => {
    const coordinates = new URL(route.request().url()).pathname.split("/").at(-1).split(";").map(point => point.split(",").map(Number));
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: 1600, duration: 300, geometry: { type: "LineString", coordinates } }] } });
  });
  await page.goto("/");
  await page.locator(".destinationCard").click();
}

for (const [width, height, query] of [[320, 568, "ЕПИ"], [390, 844, "epi"]]) {
  test(`typing ${query} suggests the real Pernik bar without submitting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page);
    await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
    let explicitSearches = 0;
    page.on("request", request => { if (request.url().includes("nominatim.openstreetmap.org/search?")) explicitSearches++; });
    const input = page.getByRole("combobox", { name: "Дестинация", exact: true });
    await input.fill(query.slice(0, 2));
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await input.fill(query);
    const suggestion = page.getByRole("option", { name: /Бар Епицентър/ });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText("Перник, Център");
    expect(await input.inputValue()).toBe(query);
    await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeDisabled();
    const request = page.waitForRequest(request => request.url().includes(";23.0312501,42.6050493"));
    await suggestion.tap();
    await request;
    await expect(input).toHaveValue("Бар Епицентър");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
    await expect(page.locator(".routeSummary")).toContainText("Бар Епицентър");
    await expect(page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ })).toBeEnabled();
    expect(explicitSearches).toBe(0);
  });
}

test("remote suggestions debounce typing, retain business names, filter country and cache repeats", async ({ page }) => {
  await prepare(page);
  const requests = [];
  await page.route("https://photon.komoot.io/api/?*", route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    const otherCountry = photonPlace("Извън България", 44, 22, 30);
    otherCountry.properties.countrycode = "RS";
    const invalid = photonPlace("Без координати", null, null, 40);
    return route.fulfill({ json: { features: [photonPlace("Кафе Кракра"), otherCountry, invalid] } });
  });
  const input = page.getByRole("combobox", { name: "Дестинация", exact: true });
  await input.pressSequentially("Кракра", { delay: 40 });
  await expect(page.getByRole("option", { name: /Кафе Кракра/ })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ q: "Кракра", countrycode: "BG", lang: "default" });
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.fill("");
  await input.fill("Кракра");
  await expect(page.getByRole("option", { name: /Кафе Кракра/ })).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("keyboard selection, Escape and pickup suggestions preserve the other address", async ({ page }) => {
  await prepare(page);
  const destination = page.getByRole("combobox", { name: "Дестинация", exact: true });
  await destination.fill("епи");
  await destination.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Бар Епицентър/ })).toHaveAttribute("aria-selected", "true");
  await destination.press("Enter");
  await expect(destination).toHaveValue("Бар Епицентър");
  const pickup = page.getByRole("combobox", { name: "Взимане", exact: true });
  await pickup.fill("епи");
  await expect(page.getByRole("listbox", { name: "Предложения за взимане" })).toBeVisible();
  await pickup.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await pickup.fill("епиц");
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
  await expect(pickup).toHaveValue("Бар Епицентър");
  await expect(destination).toHaveValue("Бар Епицентър");
});

test("late remote response cannot replace a selected local place or leak into the other field", async ({ page }) => {
  await prepare(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("https://photon.komoot.io/api/?*", async route => {
    await gate;
    await route.fulfill({ json: { features: [photonPlace("Старо предложение")] } }).catch(() => {});
  });
  const destination = page.getByRole("combobox", { name: "Дестинация", exact: true });
  const request = page.waitForRequest(request => request.url().includes("photon.komoot.io/api/"));
  await destination.fill("епи");
  await request;
  const aborted = page.waitForEvent("requestfailed", request => request.url().includes("photon.komoot.io/api/"));
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
  await aborted;
  await page.getByRole("combobox", { name: "Взимане", exact: true }).focus();
  release();
  await expect(destination).toHaveValue("Бар Епицентър");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("local suggestion survives provider failure and provider duplicates", async ({ page }) => {
  await prepare(page);
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  const input = page.getByRole("combobox", { name: "Дестинация", exact: true });
  await input.fill("епи");
  await expect(page.getByText("Другите предложения временно не са налични.")).toBeVisible();
  await expect(page.getByRole("option", { name: /Бар Епицентър/ })).toBeVisible();
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { features: [photonPlace("Епицентър", 42.6050493, 23.0312501, 8980872967)] } }));
  const response = page.waitForResponse(response => response.url().includes("photon.komoot.io/api/") && response.status() === 200);
  await input.fill("епиц");
  await response;
  await expect(page.getByText("Търсим места…")).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Бар Епицентър");
});
