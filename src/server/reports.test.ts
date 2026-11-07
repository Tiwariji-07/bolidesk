import { describe, expect, it } from "vitest";
import { csvCell } from "./reports";

describe("csvCell", () => {
  it("quotes a carriage return so it cannot start a new row", () => {
    expect(csvCell("Ravi\r=1+1")).toBe('"Ravi\r=1+1"');
  });

  it("still quotes commas, quotes and line feeds", () => {
    expect(csvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
  });

  it("disarms formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-90.00")).toBe("-90.00");
  });
});
