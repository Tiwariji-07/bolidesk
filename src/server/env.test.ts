import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./env";

const base = { DATABASE_URL: "postgresql://localhost/test", SESSION_SECRET: "a".repeat(32) };

describe("environment validation", () => {
  it("allows credential-free demo mode", () => expect(validateEnvironment({ ...base, DEMO_MODE: "true" })).toEqual([]));

  it("always requires a database and a strong session secret", () => {
    expect(validateEnvironment({ DEMO_MODE: "true", SESSION_SECRET: "short" }).map((issue) => issue.variable)).toEqual(["DATABASE_URL", "SESSION_SECRET"]);
  });

  it("lists missing production integration credentials without values", () => {
    const variables = validateEnvironment({ ...base, DEMO_MODE: "false", AI_PROVIDER: "openai", APP_URL: "http://shop.example" }).map((issue) => issue.variable);
    expect(variables).toContain("RAZORPAY_WEBHOOK_SECRET");
    expect(variables).toContain("OPENAI_API_KEY");
    expect(variables).toContain("CRON_SECRET");
    expect(variables).toContain("APP_URL");
  });
});
