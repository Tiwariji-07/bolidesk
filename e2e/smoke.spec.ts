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

test("core routes load and the job-to-payment flow is usable", async ({ page }) => {
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page).toHaveTitle("BoliDesk");
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.goto("/jobs");
  await page.getByRole("button", { name: "Parse job note" }).click();
  await expect(page.getByText("Quote total")).toBeVisible();

  await page.goto("/invoices/BD-2048");
  await page.getByRole("button", { name: "Create payment request" }).click();
  await expect(page.getByText("Payment link ready:")).toBeVisible();
});
