import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, whatsappRecipient } from "./phone";

describe("normalizePhone", () => {
  it("stores every way of typing an Indian mobile number the same way", () => {
    for (const input of ["98765 43210", "+91 98765 43210", "+91-98765-43210", "098765 43210", "919876543210", "0091 98765 43210"]) {
      expect(normalizePhone(input)).toBe("+919876543210");
    }
  });

  it("rejects numbers that are not mobiles", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
  });

  it("keeps foreign numbers given with a country code", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });

  it("formats for people and for WhatsApp", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(whatsappRecipient("+919876543210")).toBe("919876543210");
  });
});
