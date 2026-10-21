import { describe, expect, it } from "vitest";
import { parseJobNote } from "./job-note";

const today = "2026-10-21";
const lines = (note: string) => parseJobNote(note, today).lines;

describe("parseJobNote", () => {
  it("extracts customer, AC service, quantity, price, tax and due date from a WhatsApp-style note", () => {
    expect(parseJobNote("Ravi Sharma, 2 AC services at 650 each, GST 18%, due 30 July 2026", today)).toMatchObject({
      customerName: "Ravi Sharma",
      dueDate: "2026-07-30",
      lines: [{ description: "AC service", quantity: 2, unitPrice: 65000, taxRate: 18 }],
    });
  });

  it("reads Indian money notation without changing the amount", () => {
    expect(lines("Ravi, 2 AC services at 1,200 each")).toMatchObject([{ quantity: 2, unitPrice: 120000 }]);
    expect(lines("Ravi, 1 AC service at Rs 650")).toMatchObject([{ unitPrice: 65000 }]);
    expect(lines("Ravi, AC service at Rs. 1,500.50")).toMatchObject([{ quantity: 1, unitPrice: 150050 }]);
    expect(lines("Ravi, gas refill ₹2,500")).toMatchObject([{ description: "gas refill", unitPrice: 250000 }]);
    expect(lines("Ravi, capacitor 450/-")).toMatchObject([{ description: "capacitor", unitPrice: 45000 }]);
    expect(lines("Ravi, copper pipe 1,25,000")).toMatchObject([{ unitPrice: 12500000 }]);
  });

  it("reads every item in the note", () => {
    expect(lines("Suresh, 1 AC service at 650, 2 capacitors at 450 and gas refill 2500, due 5 Nov 2026")).toEqual([
      { description: "AC service", quantity: 1, unitPrice: 65000, taxRate: null },
      { description: "capacitor", quantity: 2, unitPrice: 45000, taxRate: null },
      { description: "gas refill", quantity: 1, unitPrice: 250000, taxRate: null },
    ]);
  });

  it("keeps words that only end in s", () => {
    expect(lines("Ravi, 1 glass at 500")).toMatchObject([{ description: "glass" }]);
    expect(lines("Ravi, 2 glasses at 500")).toMatchObject([{ description: "glass" }]);
    expect(lines("Ravi, 3 batteries at 120")).toMatchObject([{ description: "battery" }]);
  });

  it("handles Hinglish phrasing", () => {
    expect(parseJobNote("Suresh ji, AC service 650 rupay, kal tak", today)).toMatchObject({
      customerName: "Suresh",
      dueDate: "2026-10-22",
      lines: [{ description: "AC service", unitPrice: 65000 }],
    });
  });

  it("leaves GST unset when the note does not say it, and zero when it says no GST", () => {
    expect(lines("Ravi, AC service at 650")[0].taxRate).toBeNull();
    expect(lines("Ravi, AC service at 650, no GST")[0].taxRate).toBe(0);
    expect(lines("Ravi, AC service at 650, 5% GST")[0].taxRate).toBe(5);
  });

  it("drops impossible due dates instead of rolling them over", () => {
    expect(parseJobNote("Ravi, AC service at 650, due 31 April 2026", today).dueDate).toBeUndefined();
    expect(parseJobNote("Ravi, AC service at 650, due 15/11/2026", today).dueDate).toBe("2026-11-15");
    expect(parseJobNote("Ravi, AC service at 650, due in 7 days", today).dueDate).toBe("2026-10-28");
  });

  it("returns no lines rather than guessing", () => {
    expect(lines("Ravi, call back about the noisy compressor")).toEqual([]);
  });
});
