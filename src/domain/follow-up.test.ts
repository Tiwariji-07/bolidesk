import { describe, expect, it } from "vitest";
import { recommendFollowUp } from "./follow-up";

describe("recommendFollowUp", () => {
  it("prioritises overdue invoices for a payment reminder", () => {
    expect(recommendFollowUp({ kind: "INVOICE", status: "OVERDUE", dueDate: "2026-07-24" })).toMatchObject({
      action: "SEND_PAYMENT_REMINDER",
      priority: "HIGH",
    });
  });
});
