import { describe, expect, it } from "vitest";
import { calculateDocument, isValidGstin, taxModeFor, validateLines } from "./gst";
import { parseRupees, paiseToRupeeInput, roundHalfUp } from "./money";

const line = (unitPrice: number, quantity = 1, taxRate = 18) => ({ description: "AC service", quantity, unitPrice, taxRate, code: "998719" });

describe("money", () => {
  it("parses rupee text exactly into paise", () => {
    expect(parseRupees("650")).toBe(65000);
    expect(parseRupees("1,250.5")).toBe(125050);
    expect(parseRupees("1,25,000.50")).toBe(12500050);
    expect(parseRupees("₹ 99.99")).toBe(9999);
    for (const bad of ["1,2,50", "-5", "1e3", "12.345", "", "abc"]) expect(parseRupees(bad)).toBeNull();
    expect(parseRupees("2,00,00,000")).toBe(2_000_000_000);
    expect(parseRupees("21474836.48")).toBeNull();
  });

  it("round-trips paise to form text and rounds half up", () => {
    expect(paiseToRupeeInput(125050)).toBe("1250.50");
    expect(paiseToRupeeInput(65000)).toBe("650");
    expect(roundHalfUp(5, 10)).toBe(1);
    expect(roundHalfUp(4, 10)).toBe(0);
  });
});

describe("GST calculation", () => {
  it("rounds CGST and SGST per head, not as a split of the combined tax", () => {
    // 18% of ₹3,559 = ₹640.62; 9% = ₹320.31 per head.
    const totals = calculateDocument([line(355900)], "INTRA");
    expect([totals.cgst, totals.sgst, totals.igst, totals.total]).toEqual([32031, 32031, 0, 419962]);
  });

  it("uses IGST between states and nothing on a bill of supply", () => {
    expect(calculateDocument([line(225000)], "INTER")).toMatchObject({ igst: 40500, cgst: 0, total: 265500 });
    expect(calculateDocument([line(225000)], "NONE")).toMatchObject({ tax: 0, total: 225000, lines: [{ taxRate: 0 }] });
  });

  it("handles fractional quantities and paise prices", () => {
    // 2 × ₹650.50 = ₹1,301.00, 9% = ₹117.09 per head.
    expect(calculateDocument([line(65050, 2)], "INTRA")).toMatchObject({ subtotal: 130100, cgst: 11709, total: 153518 });
    expect(calculateDocument([line(80000, 1.5)], "INTRA").subtotal).toBe(120000);
  });

  it("picks the tax mode from scheme and states", () => {
    expect(taxModeFor("REGULAR", "29", "29")).toBe("INTRA");
    expect(taxModeFor("REGULAR", "29", "33")).toBe("INTER");
    expect(taxModeFor("COMPOSITION", "29", "33")).toBe("NONE");
    expect(taxModeFor("UNREGISTERED", "29", "29")).toBe("NONE");
  });

  it("requires allowed rates and, to issue a tax invoice, SAC/HSN codes", () => {
    expect(validateLines([line(1000, 1, 12)], { profile: "REFORM_2025", mode: "INTRA", issuing: false })).toHaveLength(1);
    expect(validateLines([line(1000, 1, 12)], { profile: "LEGACY_2017", mode: "INTRA", issuing: false })).toEqual([]);
    expect(validateLines([{ ...line(1000), code: undefined }], { profile: "REFORM_2025", mode: "INTRA", issuing: true })[0].message).toMatch(/SAC/);
    expect(validateLines([{ ...line(1000), code: undefined }], { profile: "REFORM_2025", mode: "NONE", issuing: true })).toEqual([]);
    expect(validateLines([line(1000, 0.0001)], { profile: "REFORM_2025", mode: "INTRA", issuing: false })[0].message).toMatch(/Quantity/);
    for (const quantity of [1.001, 1.003, 1.005, 2.675]) expect(validateLines([line(1000, quantity)], { profile: "REFORM_2025", mode: "INTRA", issuing: false })).toEqual([]);
  });
});

describe("GSTIN", () => {
  it("checks format, state code and checksum", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("29AAAAA0000A1Z5")).toBe(false);
  });
});
