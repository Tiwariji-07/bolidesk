import { describe, expect, it } from "vitest";
import { parseJobNote } from "./job-note";

describe("parseJobNote", () => {
  it("extracts customer, AC service, quantity, price, tax and due date from a WhatsApp-style note", () => {
    expect(
      parseJobNote("Ravi Sharma, 2 AC services at 650 each, GST 18%, due 30 July 2026"),
    ).toMatchObject({
      customerName: "Ravi Sharma",
      dueDate: "2026-07-30",
      lines: [{ description: "AC service", quantity: 2, unitPrice: 650, taxRate: 18 }],
    });
  });
});
