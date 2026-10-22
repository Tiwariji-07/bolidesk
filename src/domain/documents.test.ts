import { describe, expect, it } from "vitest";
import { balanceOf, canMoveQuote, documentNumber, invoiceDisplayStatus, settledStatus } from "./documents";

describe("document rules", () => {
  it("freezes quotes once decided or invoiced", () => {
    expect(canMoveQuote("DRAFT", "SENT")).toBe(true);
    expect(canMoveQuote("SENT", "ACCEPTED")).toBe(true);
    expect(canMoveQuote("ACCEPTED", "REJECTED")).toBe(false);
    expect(canMoveQuote("INVOICED", "DRAFT")).toBe(false);
  });

  it("numbers documents per financial year within 16 characters", () => {
    expect(documentNumber("BD", "INVOICE", "2026-10-21", 7)).toBe("BDI-2627-000007");
    expect(documentNumber("ABC", "CREDIT_NOTE", "2027-03-31", 999999)).toHaveLength(16);
    expect(() => documentNumber("ABCD", "INVOICE", "2026-10-21", 1)).toThrow();
    expect(() => documentNumber("BD", "INVOICE", "2026-10-21", 1_000_000)).toThrow();
  });

  it("derives balance and status from payments and credits", () => {
    expect(balanceOf(10000, 0, 4000)).toEqual({ total: 10000, credited: 0, paid: 4000, due: 6000, refundDue: 0 });
    expect(settledStatus("SENT", balanceOf(10000, 0, 10000))).toBe("PAID");
    expect(settledStatus("PAID", balanceOf(10000, 0, 6000))).toBe("SENT");
    expect(settledStatus("SENT", balanceOf(10000, 10000, 10000))).toBe("CREDITED");
    expect(balanceOf(10000, 10000, 10000).refundDue).toBe(10000);
    expect(settledStatus("DRAFT", balanceOf(10000, 0, 0))).toBe("DRAFT");
  });

  it("shows overdue and part-paid without storing them", () => {
    const due = new Date("2026-10-20T00:00:00.000Z");
    const now = new Date("2026-10-21T06:00:00.000Z");
    expect(invoiceDisplayStatus({ status: "SENT", dueDate: due }, balanceOf(100, 0, 0), now)).toBe("OVERDUE");
    expect(invoiceDisplayStatus({ status: "SENT", dueDate: null }, balanceOf(100, 0, 50), now)).toBe("PART_PAID");
    expect(invoiceDisplayStatus({ status: "PAID", dueDate: due }, balanceOf(100, 0, 100), now)).toBe("PAID");
  });
});
