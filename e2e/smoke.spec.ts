import "dotenv/config";
import { expect, test } from "@playwright/test";

const routes = [
  ["/", "Keep today moving"],
  ["/customers", "Customers"],
  ["/jobs", "New job"],
  ["/quotes", "Quotes"],
  ["/invoices", "Invoices"],
  ["/invoices/BD-2048", "BD-2048"],
  ["/follow-ups", "Follow-up queue"],
  ["/settings", "Settings"],
] as const;

async function signIn(page: import("@playwright/test").Page) {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error("DEMO_USER_PASSWORD is required for browser tests.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.DEMO_USER_EMAIL || "demo@bolidesk.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("private routes redirect before authentication", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Sign in to BoliDesk" })).toBeVisible();
});

test("an authenticated member can use only their session workspace and log out", async ({ page }) => {
  await signIn(page);
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page).toHaveTitle("BoliDesk");
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.goto("/jobs");
  await page.getByRole("button", { name: "Parse & save job" }).click();
  await expect(page.getByText("Quote total")).toBeVisible();

  await page.goto("/invoices/BD-2048");
  await page.getByRole("button", { name: "Create payment request" }).click();
  await expect(page.getByText("Payment link ready:")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
});
