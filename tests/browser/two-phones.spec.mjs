import { test, expect } from "@playwright/test";

const CODE = process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation";

async function login(page, role, name) {
  await page.goto(`/pilot?role=${role}`);
  await page.getByLabel("Твоето име").fill(name);
  if (role === "driver") {
    await page.getByLabel("Автомобил", { exact: true }).fill("Skoda Octavia");
    await page.getByLabel("Регистрационен номер").fill("PK 1234 AA");
  }
  await page.getByLabel("Код за вътрешния тест").fill(CODE);
  await page.getByRole("button", { name: role === "driver" ? "ВЛЕЗ КАТО ШОФЬОР" : "ВЛЕЗ КАТО ПЪТНИК" }).click();
  await expect(page.getByText("Свързано · заявките се обновяват")).toBeVisible();
}

test("two phone sessions create, accept and finish a persistent shared ride", async ({ browser }) => {
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const customer = await customerContext.newPage();
  const driver = await driverContext.newPage();
  await login(customer, "customer", "Кристиян Тест");
  await login(driver, "driver", "Иван Тест");
  await expect(driver.getByRole("heading", { name: "Изчакваме пътник" })).toBeVisible();
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await expect(customer.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Заявката е изпратена" })).toBeVisible();
  await driver.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът прие" })).toBeVisible();
  await expect(customer.getByText("PK 1234 AA", { exact: true })).toBeVisible();
  await driver.reload();
  await expect(driver.getByRole("button", { name: "ПРИСТИГНАХ", exact: true })).toBeVisible();
  await driver.getByRole("button", { name: "ПРИСТИГНАХ", exact: true }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът пристигна" })).toBeVisible();
  await driver.getByRole("button", { name: "СТАРТИРАЙ КУРСА" }).click();
  await expect(customer.getByRole("heading", { name: "Пътуването започна" })).toBeVisible();
  await expect(customer.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" })).toHaveCount(0);
  await driver.getByRole("button", { name: "ЗАВЪРШИ КУРСА" }).click();
  await expect(customer.getByRole("heading", { name: "Курсът е завършен" })).toBeVisible();
  expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await customer.screenshot({ path: "test-results/customer-completed.png", fullPage: true });
  await customer.getByRole("button", { name: "НОВА ЗАЯВКА" }).click();
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeVisible();
  await customer.reload();
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeVisible();
  await customerContext.close();
  await driverContext.close();
});

test("cancellation reaches the driver and a temporary API failure has a visible recovery", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const driverContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const driver = await driverContext.newPage();
  await login(customer, "customer", "Пътник Отказ");
  await login(driver, "driver", "Шофьор Отказ");
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  await driver.getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът прие" })).toBeVisible();
  await customer.route("**/api/pilot?action=state", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Тестово прекъсване на връзката" }) }));
  await customer.getByRole("button", { name: "Обнови заявките" }).click();
  await expect(customer.getByText("Тестово прекъсване на връзката")).toBeVisible();
  await customer.unroute("**/api/pilot?action=state");
  await customer.getByRole("button", { name: "Обнови заявките" }).click();
  await expect(customer.getByText("Свързано · заявките се обновяват")).toBeVisible();
  await customer.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Курсът е отказан" })).toBeVisible();
  await expect(driver.getByRole("heading", { name: "Готов за заявка" })).toBeVisible();
  await customerContext.close();
  await driverContext.close();
});

test("route and category change the quote and preserve the same fare for both participants", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const driverContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const driver = await driverContext.newPage();
  const name = `Цени Тест ${Date.now()}`;
  await login(customer, "customer", name);
  await login(driver, "driver", "Шофьор Цени");
  await expect(customer.getByTestId("fare-total")).toBeVisible();
  const shortPrice = await customer.getByTestId("fare-total").innerText();
  const nextQuote = () => customer.waitForResponse(response => response.url().includes("action=quote") && response.request().method() === "POST");
  const longResponse = nextQuote();
  await customer.getByLabel("Дестинация", { exact: true }).selectOption("София, Център");
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeDisabled();
  const longQuote = (await (await longResponse).json()).quote;
  await expect(customer.getByTestId("fare-total")).not.toHaveText(shortPrice);
  const premiumResponse = nextQuote();
  await customer.getByRole("combobox", { name: "Автомобил", exact: true }).selectOption("premium");
  const premiumQuote = (await (await premiumResponse).json()).quote;
  expect(premiumQuote.priceCents).toBeGreaterThan(longQuote.priceCents);
  const cityResponse = nextQuote();
  await customer.getByRole("combobox", { name: "Автомобил", exact: true }).selectOption("city");
  const cityQuote = (await (await cityResponse).json()).quote;
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeEnabled();
  const priceText = await customer.getByTestId("fare-total").innerText();
  const createdResponse = customer.waitForResponse(response => response.url().includes("action=create"));
  await customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" }).click();
  const saved = (await (await createdResponse).json()).ride;
  expect(saved.priceCents).toBe(cityQuote.priceCents);
  expect(saved.fare.distanceMeters).toBe(cityQuote.distanceMeters);
  await driver.locator(".pilotRequest").filter({ hasText: name }).getByRole("button", { name: "ПРИЕМИ ЗАЯВКАТА" }).click();
  await expect(customer.getByRole("heading", { name: "Шофьорът прие" })).toBeVisible();
  await expect(driver.locator(".pilotRideHeading .price")).toHaveText(priceText);
  await expect(customer.locator(".pilotRideHeading .price")).toHaveText(priceText);
  await customer.reload();
  await expect(customer.locator(".pilotRideHeading .price")).toHaveText(priceText);
  await customer.getByRole("button", { name: "ОТКАЖИ ЗАЯВКАТА" }).click();
  await expect(driver.getByRole("heading", { name: "Готов за заявка" })).toBeVisible();
  await customerContext.close();
  await driverContext.close();
});

test("quote failure hides the price and blocks submission until a successful retry", async ({ browser }) => {
  const context = await browser.newContext();
  const customer = await context.newPage();
  await customer.route("**/api/pilot?action=quote", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Маршрутът временно не е наличен." }) }));
  await login(customer, "customer", "Тест Маршрут");
  await expect(customer.getByText("Маршрутът временно не е наличен.", { exact: false })).toBeVisible();
  await expect(customer.getByTestId("fare-total")).toHaveCount(0);
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeDisabled();
  await customer.unroute("**/api/pilot?action=quote");
  await customer.getByRole("button", { name: "Изчисли отново" }).click();
  await expect(customer.getByTestId("fare-total")).toBeVisible();
  await expect(customer.getByRole("button", { name: "ИЗПРАТИ ЗАЯВКА" })).toBeEnabled();
  await context.close();
});

test("the main design uses road distance and ignores old fixed-price storage", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("rivoPricing", JSON.stringify({ city: 999, premium: 999 })));
  const page = await context.newPage();
  await page.route("https://router.project-osrm.org/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ distance: 35000, duration: 2400, geometry: { type: "LineString", coordinates: [[23.0379, 42.6052], [23.3219, 42.6977]] } }] }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await page.getByRole("button", { name: "ПРОДЪЛЖИ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Избери автомобил" })).toBeVisible();
  await expect(page.locator(".rideCard").filter({ hasText: "RIVO CITY" }).locator(".price")).toHaveText(/25,50/);
  await expect(page.locator(".rideCard").filter({ hasText: "RIVO PREMIUM" }).locator(".price")).toHaveText(/36,50/);
  await expect(page.getByRole("button", { name: /ПРЕГЛЕДАЙ КУРСА/ })).toBeEnabled();
  await context.close();
});
