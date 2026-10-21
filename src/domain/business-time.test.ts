import { describe, expect, it } from "vitest";
import { addDays, businessDate, financialYear, isIsoDate, isPastDue, istInstant } from "./business-time";

describe("business time (IST)", () => {
  it("uses the Indian calendar day, not the server's", () => {
    expect(businessDate(new Date("2026-10-20T19:00:00.000Z"))).toBe("2026-10-21");
    expect(businessDate(new Date("2026-10-20T18:29:59.000Z"))).toBe("2026-10-20");
  });

  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("puts 9:00 IST at 03:30 UTC", () => {
    expect(istInstant(addDays("2026-10-21", 1), 9).toISOString()).toBe("2026-10-22T03:30:00.000Z");
  });

  it("treats the due date as payable for the whole IST day", () => {
    const due = new Date("2026-10-21T00:00:00.000Z");
    expect(isPastDue(due, new Date("2026-10-21T17:00:00.000Z"))).toBe(false);
    expect(isPastDue(due, new Date("2026-10-21T18:31:00.000Z"))).toBe(true);
  });

  it("labels Indian financial years from April", () => {
    expect(financialYear("2026-03-31")).toBe("2526");
    expect(financialYear("2026-04-01")).toBe("2627");
    expect(financialYear("2099-12-01")).toBe("9900");
  });
});
