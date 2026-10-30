import { expect } from "@playwright/test";

// The simplified demo home opens the address editor before popular places.
export async function selectDemoSofia(page) {
  const editor = page.locator(".destinationCard");
  const place = page.getByRole("button", { name: "София, Център пл. „Независимост“", exact: true });
  await expect(editor.or(place).first()).toBeVisible();
  if (await editor.isVisible()) await editor.click();
  await place.click();
}
