import { describe, expect, it } from "vitest";
import { canTransitionInvoice } from "./invoice";

describe("canTransitionInvoice", () => {
  it("permits a sent invoice to be paid but never reopens a paid invoice", () => {
    expect(canTransitionInvoice("SENT", "PAID")).toBe(true);
    expect(canTransitionInvoice("PAID", "SENT")).toBe(false);
  });
});
