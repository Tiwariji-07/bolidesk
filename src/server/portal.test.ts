import { describe, expect, it } from "vitest";
import { hashPortalToken, newPortalToken } from "./portal";

describe("customer portal tokens", () => {
  it("creates opaque high-entropy tokens and only persists their deterministic hash", () => {
    const token = newPortalToken();
    expect(token).not.toContain(" ");
    expect(token.length).toBeGreaterThan(40);
    expect(hashPortalToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
