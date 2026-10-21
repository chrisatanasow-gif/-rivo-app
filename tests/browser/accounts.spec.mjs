import { test, expect } from "@playwright/test";

async function login(page, email, name) {
  await page.goto("/account");
  await page.getByLabel("Имейл", { exact: true }).fill(email);
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await expect(page.getByRole("heading", { name: "Провери имейла си." })).toBeVisible();
  await page.getByLabel("Код от имейла").fill("123456");
  await page.getByRole("button", { name: "ВЛЕЗ В RIVO" }).click();
  await expect(page.getByText("ПОТВЪРДЕН ИМЕЙЛ", { exact: true })).toBeVisible();
  if (name) {
    await page.getByLabel("Твоето име", { exact: true }).fill(name);
    await page.getByRole("button", { name: "ЗАПАЗИ ПРОФИЛА" }).click();
    await expect(page.getByRole("status")).toContainText("Профилът е запазен.");
  }
}

test("email code errors, resend cooldown, verified profile and reload", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Имейл", { exact: true }).fill("browser-profile@example.invalid");
  await page.getByRole("button", { name: "ИЗПРАТИ МИ КОД" }).click();
  await expect(page.getByRole("button", { name: /Нов код след/ })).toBeDisabled();
  await page.getByLabel("Код от имейла").fill("000000");
  await page.getByRole("button", { name: "ВЛЕЗ В RIVO" }).click();
  await expect(page.getByRole("alert")).toContainText("Кодът е грешен");
  await page.getByLabel("Код от имейла").fill("123456");
  await page.getByRole("button", { name: "ВЛЕЗ В RIVO" }).click();
  await expect(page.getByText("ПОТВЪРДЕН ИМЕЙЛ", { exact: true })).toBeVisible();
  await page.getByLabel("Твоето име", { exact: true }).fill("Крис Имейл");
  await page.getByRole("button", { name: "ЗАПАЗИ ПРОФИЛА" }).click();
  await expect(page.getByRole("heading", { name: "Здравей, Крис Имейл." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Твоето име", { exact: true })).toHaveValue("Крис Имейл");
  await expect(page.getByRole("link", { name: "ПРЕГЛЕД НА ШОФЬОРИ" })).toHaveCount(0);
  await page.getByRole("button", { name: "Изход от профила" }).click();
  await expect(page.getByLabel("Имейл", { exact: true })).toBeVisible();
  await page.goto("/account/ride");
  await expect(page.getByLabel("Имейл", { exact: true })).toBeVisible();
});

test("driver applies, authorized reviewer approves, driver queue opens", async ({ page, browser }) => {
  await login(page, "browser-driver@example.invalid", "Шофьор Имейл");
  for (const [label, value] of [["Име по документи", "Шофьор Тест"], ["Телефон за връзка", "+359888123456"], ["Марка и модел", "Тестов автомобил"], ["Регистрационен номер", "PK TEST"], ["Номер на удостоверение за водач", "TEST-CERT"], ["Номер на разрешение за автомобила", "TEST-PERMIT"], ["Разрешението е валидно до", "2027-12-31"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ИЗПРАТИ ЗА ПРЕГЛЕД" }).click();
  await expect(page.getByText("Очаква преглед", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "КЪМ ШОФЬОРСКИЯ РЕЖИМ" }).click();
  await expect(page.getByText("Новите заявки са заключени до валидно одобрение.")).toBeVisible();
  await page.getByRole("link", { name: "Моят профил" }).click();

  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  await login(owner, "reviewer@example.invalid", "Екип Тест");
  await owner.getByRole("link", { name: "ПРЕГЛЕД НА ШОФЬОРИ" }).click();
  await expect(owner.getByRole("heading", { name: "Кандидатури" })).toBeVisible();
  const card = owner.locator(".accountReview").filter({ hasText: "browser-driver@example.invalid" });
  await card.getByLabel("Бележка от проверката").fill("Проверени тестови документи и автомобил");
  await card.getByRole("checkbox").check();
  await card.getByRole("button", { name: "ЗАПАЗИ РЕШЕНИЕТО" }).click();
  await expect(card).toContainText("Одобрен шофьор");
  await page.getByRole("button", { name: "Провери статуса" }).click();
  await expect(page.getByText("Одобрен шофьор", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "КЪМ ЗАЯВКИТЕ" }).click();
  await expect(page.getByText("Новите заявки са заключени до валидно одобрение.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Моят профил", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  const action = await page.getByRole("button", { name: "ОБНОВИ ЗАЯВКИТЕ", exact: true }).boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(568);
  await ownerContext.close();
});
