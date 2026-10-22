import { execSync } from "node:child_process";
import { afterAll, beforeAll } from "vitest";
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required for database tests (use a throwaway database, it is wiped).");
if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET ??= "test-session-secret-with-at-least-thirty-two-chars";
process.env.DEMO_MODE = "true";

let migrated = false;
beforeAll(() => {
  if (migrated) return;
  execSync("npx prisma migrate reset --force", { env: { ...process.env, DATABASE_URL: testUrl, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" }, stdio: "pipe" });
  migrated = true;
});

afterAll(async () => {
  const { getPrisma } = await import("@/server/prisma");
  await getPrisma().$disconnect();
});
