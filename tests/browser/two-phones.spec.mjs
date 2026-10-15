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
