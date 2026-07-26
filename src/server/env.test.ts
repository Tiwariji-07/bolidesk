import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./env";

describe("environment validation", () => {
  it("allows credential-free demo mode", () => expect(validateEnvironment({ DEMO_MODE: "true" })).toEqual([]));
  it("lists missing production integration credentials without values", () => {
    const issues = validateEnvironment({ DEMO_MODE: "false", AI_PROVIDER: "openai" });
    expect(issues.map((issue) => issue.variable)).toContain("RAZORPAY_WEBHOOK_SECRET");
    expect(issues.map((issue) => issue.variable)).toContain("OPENAI_API_KEY");
  });
});
