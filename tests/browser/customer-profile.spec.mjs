import { test, expect } from "@playwright/test";

const KEY = "rivoCustomerProfileV1";
const sofiaButton = "София, Център пл. „Независимост“";

async function prepare(page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.6019, longitude: 23.0334 });
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.fulfill({ status: 503, body: "No map dependency in profile tests" }));
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: { name: "Перник", lat: "42.6019", lon: "23.0334" } }));
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://router.project-osrm.org/**", route => {
    const coordinates = new URL(route.request().url()).pathname.split("/").at(-1).split(";").map(point => point.split(",").map(Number));
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: 1600, duration: 300, geometry: { type: "LineString", coordinates } }] } });
  });
  await page.goto("/");
}

async function readProfile(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
}

async function bookAndComplete(page) {
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
  await page.getByRole("button", { name: /ДЕМО: (ШОФЬОРЪТ ПРИСТИГНА|ЗАПОЧНИ ПЪТУВАНЕТО)/ }).click();
  if (await page.locator(".customerArrival").count()) await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
}

for (const [width, height] of [[320, 568], [390, 844]]) {
  test(`personal name and Home survive reload; unsaved edits restore the route at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page);
    await page.getByRole("button", { name: "Отвори профила" }).click();
    await expect(page.getByText("Все още нямаш завършени пътувания.")).toBeVisible();
    await expect(page.getByText(/27 пътувания/)).toHaveCount(0);
    await page.getByLabel("Твоето име").fill("Крис");
    await page.getByRole("button", { name: "Запази името" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Здравей, Крис" })).toBeVisible();
    await page.getByRole("button", { name: "Дом", exact: true }).click();
    const address = page.getByRole("combobox", { name: "Адрес за Дом", exact: true });
    await expect(page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" })).toBeDisabled();
    await address.fill("епи");
    await expect(page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" })).toBeDisabled();
    await page.getByRole("option", { name: /Бар Епицентър/ }).click();
    await page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" }).click();
    await page.reload();
    expect((await readProfile(page)).places.home).toMatchObject({ label: "Бар Епицентър", lat: 42.6050493, lng: 23.0312501 });
    await page.getByRole("button", { name: "Дом", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Дестинация", exact: true })).toHaveValue("Бар Епицентър");
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByRole("button", { name: "Отвори профила" }).click();
    await page.getByRole("button", { name: "Промени Дом" }).click();
    await page.getByRole("combobox", { name: "Адрес за Дом", exact: true }).fill("незапазена промяна");
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page.locator(".destinationCard")).toContainText("Бар Епицентър");
    expect((await readProfile(page)).places.home.label).toBe("Бар Епицентър");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Work can be edited and removed without changing Home", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await page.getByRole("button", { name: sofiaButton, exact: true }).click();
  await page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" }).click();
  await page.getByRole("button", { name: "Дом", exact: true }).click();
  await page.getByRole("combobox", { name: "Адрес за Дом", exact: true }).fill("епи");
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
  await page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" }).click();
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await page.getByRole("button", { name: "Промени Работа" }).click();
  await page.getByRole("combobox", { name: "Адрес за Работа", exact: true }).fill("епи");
  await page.getByRole("option", { name: /Бар Епицентър/ }).click();
  await page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" }).click();
  await page.getByRole("button", { name: "Промени Работа" }).click();
  await page.getByRole("button", { name: "Премахни адреса" }).click();
  await page.reload();
  expect((await readProfile(page)).places).toMatchObject({ home: { label: "Бар Епицентър" }, work: null });
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Адрес за Работа", exact: true })).toHaveValue("");
});

test("completed rides persist before Done, feedback persists, and repeating requotes the route", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: sofiaButton, exact: true }).click();
  await bookAndComplete(page);
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/2,12/);
  await page.getByRole("button", { name: "2 звезди", exact: true }).click();
  await page.getByRole("button", { name: "+2 €", exact: true }).click();
  const first = await readProfile(page);
  expect(first.rides).toHaveLength(1);
  expect(first.rides[0]).toMatchObject({ priceCents: 212, tipCents: 200, rating: 2 });
  await page.reload();
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await expect(page.locator(".historyRow")).toHaveCount(1);
  await expect(page.locator(".historyRow")).toContainText(/4,12/);
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 10000, duration: 1200, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.3219, 42.6977]] } }] } }));
  await page.getByRole("button", { name: /Повтори маршрут/ }).click();
  await expect(page.getByRole("combobox", { name: "Взимане", exact: true })).toHaveValue(first.rides[0].pickup.label);
  await expect(page.getByRole("combobox", { name: "Дестинация", exact: true })).toHaveValue("София, Център");
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.locator(".rideCard .price")).toHaveText(/8,00/);
  expect((await readProfile(page)).rides[0].priceCents).toBe(212);
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
  await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
  await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
  await expect(page.locator(".receiptRow.total strong")).toHaveText(/8,00/);
  await page.getByRole("button", { name: "ГОТОВО", exact: true }).click();
  const final = await readProfile(page);
  expect(final.rides).toHaveLength(2);
  expect(new Set(final.rides.map(ride => ride.id)).size).toBe(2);
});

test("storage failure is visible, the session stays usable, and retry saves the profile", async ({ page }) => {
  await page.addInitScript(key => {
    window.__blockProfileWrites = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && window.__blockProfileWrites) throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, KEY);
  await prepare(page);
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await page.getByLabel("Твоето име").fill("Крис");
  await page.getByRole("button", { name: "Запази името" }).click();
  await expect(page.getByText(/Промените са само за тази сесия/)).toBeVisible();
  await expect(page.locator(".profileHero")).toContainText("Крис");
  await page.evaluate(() => { window.__blockProfileWrites = false; });
  await page.getByRole("button", { name: "Опитай да запазиш отново" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Здравей, Крис" })).toBeVisible();
});

test("invalid stored locations and history cannot break the profile or confirm an address", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ version: 1, name: 42,
    places: { home: { label: "Invalid", lat: null, lng: null } }, rides: [{ id: "bad", completedAt: "not-a-date", priceCents: -1 }]
  })), KEY);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await prepare(page);
  await page.getByRole("button", { name: "Отвори профила" }).click();
  await expect(page.getByText("Все още нямаш завършени пътувания.")).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Дом", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Адрес за Дом", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "ЗАПАЗИ АДРЕСА" })).toBeDisabled();
  expect(errors).toEqual([]);
});
