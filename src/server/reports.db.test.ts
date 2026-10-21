import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { createBlankInvoice, issueInvoice, saveInvoiceDraft } from "./billing";
import { issueCreditNote } from "./credit-notes";
import { createCustomer } from "./customers";
import { getPrisma } from "./prisma";
import { recordPayment } from "./payments";
import { dayBook, receivablesAgeing, salesRegisterCsv } from "./reports";

describe("reports (Postgres)", () => {
  it("books money on the IST day it was received and exports a spreadsheet-safe register", async () => {
    const shop = await makeShop();
    await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Shop Pvt Ltd", address: "1 MG Road", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW" } });
    const customer = await createCustomer(shop.office, { name: "=HYPERLINK(\"x\")", phone: "98765 43210" });
    const draft = await createBlankInvoice(shop.office, customer.id);
    await saveInvoiceDraft(shop.office, { id: draft.id, version: 0, dueDate: "2026-01-01", lines: [{ description: "AC service", quantity: 1, unitPrice: "1000", taxRate: 18, code: "998719" }] });
    const invoice = await issueInvoice(shop.office, { id: draft.id, version: 1 });
    const cash = await recordPayment(shop.technician, { invoiceId: invoice.id, amount: "180", method: "CASH", idempotencyKey: `rep-${invoice.id}` });
    // Received at 00:30 IST on 21 Oct, which is still 20 Oct in UTC.
    await getPrisma().payment.update({ where: { id: cash.paymentId }, data: { occurredAt: new Date("2026-10-20T19:00:00.000Z") } });
    expect((await dayBook(shop.workspace.id, "2026-10-21")).collected).toBe(18000);
    expect((await dayBook(shop.workspace.id, "2026-10-20")).collected).toBe(0);
    expect(await receivablesAgeing(shop.workspace.id, new Date("2026-10-21T06:00:00.000Z"))).toMatchObject({ over60: 100000 });

    const fresh = await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await issueCreditNote(shop.owner, { invoiceId: invoice.id, version: fresh.version, reason: "Billed twice" });
    const issueDay = fresh.issueDate!.toISOString().slice(0, 10);
    const csv = await salesRegisterCsv(shop.workspace.id, issueDay, issueDay);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Type,Number,Date,Against invoice,Customer,Customer GSTIN,Place of supply,Taxable value,CGST,SGST,IGST,GST not split,Total");
    expect(lines[1]).toContain(`Tax invoice,${invoice.number}`);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain("1000.00,90.00,90.00,0.00,0.00,1180.00");
    expect(lines[2]).toMatch(/^Credit note,BDC-.*-1000\.00,-90\.00,-90\.00,0\.00,0\.00,-1180\.00$/);
  });
});
