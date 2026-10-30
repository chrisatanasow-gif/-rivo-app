import { test, expect } from "@playwright/test";

const api = action => `/api/member-rides?role=customer&action=${action}`;
async function post(context, path, body) {
  const response = await context.request.post(path, { headers: { Origin: "http://127.0.0.1:4178" }, data: body });
  const data = await response.json();
  expect(response.ok(), JSON.stringify(data)).toBe(true);
  return data;
}
async function account(context, label = "recovery") {
  const email = `${label}-${crypto.randomUUID()}@example.invalid`;
  await post(context, "/api/auth/email-otp/send-verification-otp", { email });
  await post(context, "/api/auth/sign-in/email-otp", { email, otp: "123456" });
  await post(context, "/api/account?action=profile", { name: "Пътник Възстановяване" });
}
const route = () => ({ pickup: { label: "Точно GPS взимане", lat: 42.601234, lng: 23.031234 }, destination: { label: "Точно GPS оставяне", lat: 42.611234, lng: 23.051234 }, passengers: 3, idempotencyKey: crypto.randomUUID() });
async function create(context) {
  const body = route();
  const { quote } = await post(context, api("quote"), body);
  return { body, quote, ride: (await post(context, api("create"), { ...body, quoteToken: quote.token })).ride };
}
const stateRoute = "**/api/member-rides?**";

test("waiting keeps one request while free-driver availability and remaining time refresh", async ({ page, context }) => {
  await account(context);
  const first = await create(context);
  let creates = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("action=create")) creates++; });
  await page.goto("/account/ride");
  await expect(page.getByRole("heading", { name: "Заявката е изпратена", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "В момента няма свободен шофьор", exact: true })).toBeVisible();
  await expect(page.getByText(/Заявката ти остава активна/)).toBeVisible();
  await expect(page.getByText(/Не сме създали заявка/)).toHaveCount(0);
  await expect(page.getByRole("timer", { name: "Оставащо време за търсене" })).toContainText(/\d{2}:\d{2}/);
  await page.getByRole("button", { name: "ПРОВЕРИ ОТНОВО", exact: true }).click();
  const state = await (await context.request.get(api("state"))).json();
  expect(state.activeRide.id).toBe(first.ride.id); expect(state.rides).toHaveLength(1); expect(creates).toBe(0);
  await expect(page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true })).toHaveCount(0);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
});

test("a failed availability refresh shows unknown instead of a cached no-driver claim", async ({ page, context }) => {
  await account(context);
  await page.goto("/account/ride");
  await expect(page.getByRole("heading", { name: "В момента няма свободен шофьор", exact: true })).toBeVisible();
  await page.route(stateRoute, async request => {
    if (new URL(request.request().url()).searchParams.get("action") === "state") return request.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Тестово прекъсване" }) });
    await request.continue();
  });
  await page.getByRole("button", { name: "ПРОВЕРИ ОТНОВО", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Наличността не е потвърдена", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "В момента няма свободен шофьор", exact: true })).toHaveCount(0);
  await page.unroute(stateRoute);
  await page.getByRole("button", { name: "ПРОВЕРИ ОТНОВО", exact: true }).click();
  await expect(page.getByRole("heading", { name: "В момента няма свободен шофьор", exact: true })).toBeVisible();
});

for (const width of [320, 390]) test(`retry survives reload with exact route, passengers and a fresh quote at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await account(context);
  const first = await create(context);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
  const quotes = []; let creates = 0;
  page.on("request", request => {
    if (request.method() !== "POST") return;
    if (request.url().includes("action=quote")) quotes.push(request.postDataJSON());
    if (request.url().includes("action=create")) creates++;
  });
  await page.goto("/account/ride");
  await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByTestId("fare-total")).toBeVisible();
  const before = quotes.length;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Детайли за курса", exact: true })).toBeVisible();
  await expect(page.getByText("Точно GPS взимане", { exact: true })).toBeVisible();
  await expect(page.getByText("Точно GPS оставяне", { exact: true })).toBeVisible();
  await expect(page.getByTestId("fare-total")).toBeVisible();
  await expect.poll(() => quotes.length).toBeGreaterThan(before);
  expect(quotes.at(-1).pickup).toEqual(first.body.pickup); expect(quotes.at(-1).destination).toEqual(first.body.destination);
  await expect(page.locator(".summaryMeta")).toContainText("3 пътници");
  expect(creates).toBe(0);
  const button = await page.getByRole("button", { name: "ПРЕГЛЕДАЙ КУРСА", exact: true }).boundingBox();
  expect(button.y + button.height).toBeLessThanOrEqual(width === 320 ? 568 : 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("waiting follows the server clock and an elapsed timer cannot declare the request expired", async ({ page, context }) => {
  await account(context);
  const first = await create(context);
  let elapsed = false;
  await page.route(stateRoute, async request => {
    if (new URL(request.request().url()).searchParams.get("action") !== "state") return request.continue();
    const response = await request.fetch(); const data = await response.json();
    // A phone whose clock differs by a day must still show the server's deadline.
    const server = Date.now() + 86400000;
    data.serverTime = new Date(server).toISOString();
    data.availability.checkedAt = data.serverTime;
    data.activeRide.expiresAt = new Date(server + (elapsed ? -1000 : 45000)).toISOString();
    await request.fulfill({ response, json: data });
  });
  await page.goto("/account/ride");
  await expect(page.getByRole("timer", { name: "Оставащо време за търсене" })).toContainText(/00:4\d/);
  elapsed = true;
  await page.getByRole("button", { name: "ПРОВЕРИ ОТНОВО", exact: true }).click();
  await expect(page.getByText("Проверяваме резултата от търсенето…", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Заявката е изпратена", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true })).toHaveCount(0);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
});

test("a newer active request wins over a saved retry and clears the old retry marker", async ({ page, context }) => {
  await account(context);
  const first = await create(context);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
  await page.goto("/account/ride");
  await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByTestId("fare-total")).toBeVisible();
  const next = await create(context);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Заявката е изпратена", exact: true })).toBeVisible();
  await expect(page.getByTestId("ride-number")).toContainText(next.ride.id.slice(0, 8).toUpperCase());
  await expect.poll(() => page.evaluate(id => Object.keys(sessionStorage).some(key => key.startsWith("rivoRetryRideV1:") && sessionStorage.getItem(key) === id), first.ride.id)).toBe(false);
  await post(context, api("transition"), { rideId: next.ride.id, command: "cancel" });
});

test("a retry marker cannot restore another account's route in the same browser", async ({ page, context }) => {
  await account(context, "first-account");
  const first = await create(context);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
  await page.goto("/account/ride");
  await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByTestId("fare-total")).toBeVisible();
  await post(context, "/api/auth/sign-out", {});
  await account(context, "second-account");
  await page.goto("/account/ride");
  await expect(page.getByRole("heading", { name: "Къде отиваме?", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Взимане", exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Дестинация", exact: true })).toHaveValue("");
  await expect(page.getByText("Точно GPS взимане", { exact: true })).toHaveCount(0);
  const state = await (await context.request.get(api("state"))).json();
  expect(state.activeRide).toBeNull(); expect(state.rides).toEqual([]);
});

test("unavailable tab storage keeps the current retry usable and explains reload recovery", async ({ page, context }) => {
  await account(context);
  const first = await create(context);
  await post(context, api("transition"), { rideId: first.ride.id, command: "cancel" });
  await page.goto("/account/ride");
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith("rivoRetryRideV1:")) throw new DOMException("Blocked", "SecurityError"); return original.call(this, key, value); }; });
  await page.getByRole("button", { name: "ОПИТАЙ ОТНОВО", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Детайли за курса", exact: true })).toBeVisible();
  await expect(page.getByText(/Не успяхме да запазим избора/)).toBeVisible();
  await expect(page.getByText("Точно GPS взимане", { exact: true })).toBeVisible();
  await expect(page.getByTestId("fare-total")).toBeVisible();
});
