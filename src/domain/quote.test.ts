import { describe, expect, it } from "vitest";
import { calculateQuoteTotals } from "./quote";

describe("calculateQuoteTotals", () => {
  it("calculates Indian GST totals from line items", () => {
    expect(
      calculateQuoteTotals([
        { description: "AC service", quantity: 2, unitPrice: 650, taxRate: 18 },
        { description: "Capacitor", quantity: 1, unitPrice: 950, taxRate: 18 },
      ]),
    ).toEqual({ subtotal: 2250, tax: 405, total: 2655 });
  });
});
