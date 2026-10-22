import { describe, expect, it } from "vitest";
import { FakeRazorpay } from "@/test/fake-razorpay";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { createBlankInvoice, issueInvoice, saveInvoiceDraft } from "./billing";
import { issueCreditNote } from "./credit-notes";
import { createCustomer } from "./customers";
import { createPaymentRequest, recordPayment, recordRefund } from "./payments";
import { getPrisma } from "./prisma";

async function issued() {
  const shop = await makeShop();
  await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Test Shop Pvt Ltd", address: "1 MG Road", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW" } });
  const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
  const draft = await createBlankInvoice(shop.office, customer.id);
  await saveInvoiceDraft(shop.office, { id: draft.id, version: 0, lines: [{ description: "AC service", quantity: 1, unitPrice: "1000", taxRate: 18, code: "998719" }] });
  return { shop, invoice: await issueInvoice(shop.office, { id: draft.id, version: 1 }) };
}

describe("credit notes (Postgres)", () => {
  it("lets only the owner cancel an invoice, once, reversing its exact tax heads", async () => {
    const { shop, invoice } = await issued();
    await expect(issueCreditNote(shop.office, { invoiceId: invoice.id, version: invoice.version, reason: "Wrong customer" })).rejects.toBeInstanceOf(AccessError);
    const note = await issueCreditNote(shop.owner, { invoiceId: invoice.id, version: invoice.version, reason: "Wrong customer" });
    expect(note.number).toMatch(/^BDC-\d{4}-000001$/);
    expect(await getPrisma().creditNote.findUniqueOrThrow({ where: { invoiceId: invoice.id } })).toMatchObject({ cgstPaise: 9000, sgstPaise: 9000, totalPaise: 118000 });
    expect((await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("CREDITED");
    await expect(issueCreditNote(shop.owner, { invoiceId: invoice.id, version: invoice.version + 1, reason: "again" })).rejects.toThrow(/Already cancelled/);
  });

  it("turns money already received into a refund due and cancels the open link", async () => {
    const { shop, invoice } = await issued();
    const razorpay = new FakeRazorpay();
    await recordPayment(shop.office, { invoiceId: invoice.id, amount: "500", method: "CASH", idempotencyKey: `cn-${invoice.id}` });
    await createPaymentRequest(shop.office, invoice.id, razorpay);
    const fresh = await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const result = await issueCreditNote(shop.owner, { invoiceId: invoice.id, version: fresh.version, reason: "Job not done" }, razorpay);
    expect(result.refundDuePaise).toBe(50000);
    expect([...razorpay.links.values()].every((link) => link.status === "cancelled")).toBe(true);
    await expect(recordPayment(shop.office, { invoiceId: invoice.id, amount: "1", method: "CASH", idempotencyKey: `cn2-${invoice.id}` })).rejects.toThrow(/credit note/);
    await recordRefund(shop.owner, { invoiceId: invoice.id, amount: "500", method: "CASH", reference: "", reason: "Job not done" , idempotencyKey: `r1-${invoice.id}` });
    await expect(recordRefund(shop.owner, { invoiceId: invoice.id, amount: "1", method: "CASH", reference: "", reason: "again" , idempotencyKey: `r2-${invoice.id}` })).rejects.toThrow(/Only ₹0/);
  });

  it("cancels an invoice issued before tax heads existed, reversing its GST as a total", async () => {
    const { shop, invoice } = await issued();
    // What the billing migration leaves for an old invoice: tax kept, heads zero.
    const legacy = await getPrisma().invoice.update({ where: { id: invoice.id }, data: { cgstPaise: 0, sgstPaise: 0, igstPaise: 0 } });
    await issueCreditNote(shop.owner, { invoiceId: invoice.id, version: legacy.version, reason: "Old job cancelled" });
    expect(await getPrisma().creditNote.findUniqueOrThrow({ where: { invoiceId: invoice.id } })).toMatchObject({ taxPaise: 18000, cgstPaise: 0, totalPaise: 118000 });
    expect((await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("CREDITED");
  });
});
