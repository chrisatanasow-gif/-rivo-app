import { test, expect } from "@playwright/test";

const result = (name, lat = 42.61, lon = 23.05) => ({ name, lat: String(lat), lon: String(lon), address: { city: "Перник" } });

async function fixtures(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("rivoCustomerProfileV1")) localStorage.setItem("rivoCustomerProfileV1", JSON.stringify({
      version: 1, name: "Кристиян", places: {
        home: { label: "Перник, Изток", lat: 42.6048, lng: 23.0422 },
        work: { label: "София, Център", lat: 42.6977, lng: 23.3219 }
      }, rides: []
    }));
  });
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.6019, longitude: 23.0334 });
  // Empty vector tiles keep these behavior tests independent of public map servers.
  await page.route("https://tiles.basemaps.cartocdn.com/**", route => route.request().url().endsWith("tiles.json")
    ? route.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.basemaps.cartocdn.com/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
  await page.route("https://photon.komoot.io/api/?*", route => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await page.route("https://nominatim.openstreetmap.org/reverse?*", route => route.fulfill({ json: result("Перник, Център", 42.6019, 23.0334) }));
  await page.route("https://nominatim.openstreetmap.org/search?*", route => route.fulfill({ json: [result("ул. „Кракра“ 10, Перник — вход до площад „Кракра Пернишки“")] }));
  await page.route("https://router.project-osrm.org/**", route => {
    const coordinates = new URL(route.request().url()).pathname.split("/").at(-1).split(";").map(point => point.split(",").map(Number));
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: coordinates[0][0] === 23.05 ? 8000 : 5000, duration: 900, geometry: { type: "LineString", coordinates } }] } });
  });
}

async function assertPinned(page, name) {
  const button = page.getByRole("button", { name });
  await button.click({ trial: true });
  const before = await button.boundingBox();
  const footer = page.locator(".customerActions"); const fixed = await footer.boundingBox();
  expect(before.y).toBeGreaterThan(0);
  expect(before.y + before.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(before.height).toBeGreaterThanOrEqual(44);
  await page.locator(".customerBooking .content").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await button.click({ trial: true });
  const after = await button.boundingBox();
  expect(after.y + after.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect((await footer.boundingBox()).y).toBeCloseTo(fixed.y, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932]]) {
  test(`passenger can edit pickup, review and book with visible actions at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fixtures(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Работа", exact: true }).click();
    await assertPinned(page, "ПРОДЪЛЖИ");
    await page.getByLabel("Взимане", { exact: true }).fill("Кракра 10, Перник");
    await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeDisabled();
    await page.getByLabel("Взимане", { exact: true }).press("Enter");
    await page.getByRole("group", { name: "Резултати от търсене" }).getByRole("option").click();
    await expect(page.getByRole("combobox", { name: "Дестинация", exact: true })).toHaveValue("София, Център");
    await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
    await expect(page.locator(".rideCard .price")).toHaveText(/6,60/);
    await assertPinned(page, /ПРЕГЛЕДАЙ КУРСА/);
    await expect(page.getByRole("button", { name: "Намали пътниците" })).toBeDisabled();
    for (let count = 0; count < 3; count++) await page.getByRole("button", { name: "Добави пътник" }).click();
    await expect(page.getByRole("button", { name: "Добави пътник" })).toBeDisabled();
    await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
    await expect(page.locator(".routeSummary")).toContainText("ул. „Кракра“ 10");
    await expect(page.locator(".routeSummary")).toContainText("4 пътници");
    await assertPinned(page, "ПОРЪЧАЙ RIVO");
    await page.getByRole("button", { name: "Промени детайлите" }).click();
    await expect(page.locator(".stepper")).toContainText("4 пътници");
    await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
    await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
    await expect(page.locator(".pickupSummary")).toContainText("ул. „Кракра“ 10");
    await page.getByRole("button", { name: /ДЕМО: (ШОФЬОРЪТ ПРИСТИГНА|ЗАПОЧНИ ПЪТУВАНЕТО)/ }).click();
    if (await page.locator(".customerArrival").count()) await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
    await expect(page.locator(".activeTripCard .price")).toHaveText(/6,60/);
    await assertPinned(page, "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО");
    await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
    await expect(page.locator(".receiptRow.total strong")).toHaveText(/6,60/);
    await assertPinned(page, "ГОТОВО");
    await page.getByRole("button", { name: "2 звезди", exact: true }).click();
    await expect(page.getByRole("button", { name: "2 звезди", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "+2 €", exact: true }).click();
    await expect(page.locator(".receiptRow.total strong")).toHaveText(/8,60/);
    await page.getByRole("button", { name: "ГОТОВО", exact: true }).click();
    await expect(page.locator(".homeContent")).toBeVisible();
    await page.getByRole("button", { name: "Отвори профила", exact: true }).click();
    await expect(page.locator(".historyRow").first()).toContainText(/8,60/);
  });
}

test("an older address search cannot replace newer results or a saved place", async ({ page }) => {
  await fixtures(page);
  let releaseOld;
  const oldReleased = new Promise(resolve => { releaseOld = resolve; });
  await page.route("https://nominatim.openstreetmap.org/search?*", async route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "стар адрес") await oldReleased;
    await route.fulfill({ json: [result(query)] });
  });
  await page.goto("/");
  await page.locator(".destinationCard").click();
  const destination = page.getByRole("combobox", { name: "Дестинация", exact: true });
  await destination.fill("стар адрес");
  const oldRequest = page.waitForRequest(request => request.url().includes("q=%D1%81%D1%82%D0%B0%D1%80"));
  await destination.press("Enter");
  await oldRequest;
  await destination.fill("нов адрес");
  await destination.press("Enter");
  await expect(page.getByRole("group", { name: "Резултати от търсене" })).toContainText("нов адрес");
  const oldResponse = page.waitForResponse(response => response.url().includes("q=%D1%81%D1%82%D0%B0%D1%80"));
  releaseOld();
  await oldResponse;
  await expect(page.getByRole("group", { name: "Резултати от търсене" })).not.toContainText("стар адрес");
  await page.getByRole("button", { name: "Дом Перник, Изток" }).click();
  await expect(destination).toHaveValue("Перник, Изток");
  await expect(page.getByRole("group", { name: "Резултати от търсене" })).toHaveCount(0);
});

test("arrival is separate from trip start and cancellation follows the current stage", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
  await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
  await expect(page.locator(".customerMatching")).toContainText("ЗАЯВКАТА Е ИЗПРАТЕНА");
  await expect(page.locator(".arrivalStatus")).toHaveText("ШОФЬОРЪТ ИДВА");
  await assertPinned(page, "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА");
  await page.getByRole("button", { name: "Откажи курса", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Отказваш курса?" });
  await expect(dialog).toContainText("Шофьорът е на път към теб.");
  await expect(dialog.getByRole("button", { name: "Запази курса" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Откажи курса" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Запази курса" })).toBeFocused();
  await expect(dialog).toContainText("Шофьорът те чака на мястото за взимане.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Откажи курса", exact: true })).toBeFocused();
  await expect(page.locator(".arrivalStatus")).toHaveText("ШОФЬОРЪТ ПРИСТИГНА");
  await expect(page.locator(".customerTrip")).toHaveCount(0);
  await assertPinned(page, "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО");
  await page.getByRole("button", { name: "Откажи курса", exact: true }).click();
  await dialog.getByRole("button", { name: "Откажи курса" }).click();
  await expect(page.locator(".homeContent")).toBeVisible();
});

test("remaining time uses the route and a new trip resets the rating and tip", async ({ page }) => {
  await fixtures(page);
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 35000, duration: 2400, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.3219, 42.6977]] } }] } }));
  await page.goto("/");
  for (let trip = 0; trip < 2; trip++) {
    await page.getByRole("button", { name: "Работа", exact: true }).click();
    await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
    await page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ }).click();
    await page.getByRole("button", { name: "ПОРЪЧАЙ RIVO", exact: true }).click();
    await page.getByRole("button", { name: "ДЕМО: ШОФЬОРЪТ ПРИСТИГНА" }).click();
    await expect(page.locator(".customerArrival")).toBeVisible();
    await page.getByRole("button", { name: "ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО" }).click();
    const heading = await page.locator(".customerTrip h1").innerText();
    expect(Number(heading.match(/\d+/)[0])).toBeGreaterThan(25);
    await expect(page.locator(".activeTripCard .price")).toHaveText(/25,50/);
    await page.getByRole("button", { name: "ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО" }).click();
    await expect(page.getByRole("button", { name: "5 звезди", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Без бакшиш", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".receiptRow.total strong")).toHaveText(/25,50/);
    await page.getByRole("button", { name: "1 звезда", exact: true }).click();
    await page.getByRole("button", { name: "+5 €", exact: true }).click();
    await page.getByRole("button", { name: "ГОТОВО", exact: true }).click();
  }
});

test("late GPS and map lookups preserve the passenger's newer choices", async ({ page }) => {
  await fixtures(page);
  let releaseReverse;
  const released = new Promise(resolve => { releaseReverse = resolve; });
  let reverseCount = 0;
  await page.route("https://nominatim.openstreetmap.org/reverse?*", async route => {
    reverseCount++;
    await released;
    await route.fulfill({ json: result("Стар адрес от GPS или карта") });
  });
  await page.goto("/");
  await expect.poll(() => reverseCount).toBe(1);
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await page.getByLabel("Взимане", { exact: true }).fill("Кракра");
  await page.getByLabel("Взимане", { exact: true }).press("Enter");
  await page.getByRole("group", { name: "Резултати от търсене" }).getByRole("option").click();
  await page.getByRole("combobox", { name: "Дестинация", exact: true }).focus();
  await expect(page.locator(".mapLoadingState")).toHaveCount(0);
  await page.locator(".liveMap canvas").click({ position: { x: 100, y: 120 } });
  await expect.poll(() => reverseCount).toBe(2);
  await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Дом Перник, Изток" }).click();
  const reverseResponse = page.waitForResponse(response => response.url().includes("/reverse?"));
  releaseReverse();
  await reverseResponse;
  await expect(page.getByRole("combobox", { name: "Дестинация", exact: true })).toHaveValue("Перник, Изток");
  await expect(page.getByLabel("Взимане", { exact: true })).toHaveValue(/Кракра/);
  await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeEnabled();
});

test("search and route failures recover without booking an unpriced route", async ({ page }) => {
  await fixtures(page);
  await page.route("https://nominatim.openstreetmap.org/search?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/");
  await page.locator(".destinationCard").click();
  await page.getByRole("combobox", { name: "Дестинация", exact: true }).fill("Липсващ адрес");
  await page.getByRole("combobox", { name: "Дестинация", exact: true }).press("Enter");
  await expect(page.getByText(/Търсенето не е налично/)).toBeVisible();
  await expect(page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true })).toBeDisabled();
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("button", { name: "Дом Перник, Изток" }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByText("Маршрутът временно не е наличен. Не можем да изчислим цена.")).toBeVisible();
  await expect(page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ })).toBeDisabled();
  await page.unroute("https://router.project-osrm.org/**");
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ json: { code: "Ok", routes: [{ distance: 5000, duration: 600, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.0422, 42.6048]] } }] } }));
  await page.getByRole("button", { name: "ИЗЧИСЛИ ОТНОВО" }).click();
  await expect(page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ })).toBeEnabled();
  await expect(page.locator(".rideCard .price")).toHaveText(/4,50/);
});
