import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";

const routes = [["/", "Keep today moving"], ["/customers", "Customers"], ["/jobs", "Jobs"], ["/quotes", "Quotes"], ["/invoices", "Invoices"], ["/follow-ups", "Follow-ups"], ["/settings", "Settings"], ["/settings/team", "Team"]] as const;

async function signIn(page: Page) {
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

test("the owner can reach every page and sign out", async ({ page }) => {
  await signIn(page);
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL("/login");
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("a job note becomes an issued, paid invoice", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);
  await page.goto("/jobs");
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Meera Nair" });
  await page.getByLabel("Job note or voice-note transcript").fill("Meera Nair, 1 gas refill at Rs 2,500, 2 filters at 350 each, GST 18%");
  await page.getByRole("button", { name: "Save and read note" }).click();
  await expect(page.locator("[aria-live=polite]").getByText("gas refill", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Make draft quote" }).click();
  await expect(page).toHaveURL(/\/quotes\//);

  await page.getByLabel("Rate (₹)").first().fill("2,600");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Mark sent" }).click();
  await page.getByRole("button", { name: "Customer accepted" }).click();
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\//);

  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByRole("heading", { name: /^BDI-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(page.getByText("Tax Invoice")).toBeVisible();
  // Part payment by cash, then the rest by UPI with a reference.
  await page.getByLabel("Amount received (₹)").fill("1,000");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Receipt BDR-\d{4}-\d{6} recorded/)).toBeVisible();
  await expect(page.locator(".page-header .status")).toHaveText("part paid");
  await page.getByLabel("How").selectOption("UPI");
  await page.getByLabel("UPI / bank reference").fill("UTR998877");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator(".page-header .status")).toHaveText("paid");
  await page.getByRole("link", { name: "Receipt" }).first().click();
  await expect(page.getByRole("heading", { name: /^BDR-/ })).toBeVisible();
});

test("the owner invites a technician who sees only field work", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/settings/team");
  const email = `tech-${Date.now()}@example.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role").selectOption("MEMBER");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.locator(".copy-link code").innerText();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);

  const technician = await browser.newPage();
  await technician.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await technician.getByLabel("Your name").fill("Suresh");
  await technician.getByLabel("Choose a password (12+ characters)").fill("a long technician password");
  await technician.getByLabel("Repeat password").fill("a long technician password");
  await technician.getByRole("button", { name: "Join the team" }).click();
  await expect(technician).toHaveURL("/");
  await expect(technician.getByRole("link", { name: "Day book" })).toHaveCount(0);
  await technician.goto("/jobs");
  await expect(technician.getByRole("heading", { name: "My jobs" })).toBeVisible();
  await technician.goto("/reports");
  await expect(technician).toHaveURL(/\/\?error=forbidden/);

  // The invite link works once.
  const again = await browser.newPage();
  await again.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(again.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
});
