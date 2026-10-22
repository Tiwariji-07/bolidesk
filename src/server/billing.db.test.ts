import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { convertQuote, createBlankInvoice, createBlankQuote, issueInvoice, moveQuote, saveInvoiceDraft, saveQuoteDraft } from "./billing";
import { createCustomer, updateCustomer } from "./customers";
import { recordPayment } from "./payments";
import { getPrisma } from "./prisma";

const line = { description: "AC service", quantity: 2, unitPrice: "650.50", taxRate: 18, code: "998719" };

async function readyShop() {
  const shop = await makeShop();
  await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Test Shop Pvt Ltd", address: "1 MG Road, Bengaluru", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW", invoicePrefix: "TS" } });
  const customer = await createCustomer(shop.office, { name: "Ravi Sharma", phone: "98765 43210", stateCode: "29" });
  return { ...shop, customer };
}

async function draftInvoice(shop: Awaited<ReturnType<typeof readyShop>>) {
  const invoice = await createBlankInvoice(shop.office, shop.customer.id);
  await saveInvoiceDraft(shop.office, { id: invoice.id, version: invoice.version, lines: [line] });
  return getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

describe("billing documents (Postgres)", () => {
  it("gives concurrent issues unique, consecutive numbers", async () => {
    const shop = await readyShop();
    const drafts = await Promise.all(Array.from({ length: 6 }, () => draftInvoice(shop)));
    const issued = await Promise.all(drafts.map((draft) => issueInvoice(shop.office, { id: draft.id, version: draft.version })));
    const sequence = issued.map((invoice) => Number(invoice.number!.slice(-6))).sort((a, b) => a - b);
    expect(sequence).toEqual([1, 2, 3, 4, 5, 6]);
    expect(issued[0].number).toMatch(/^TSI-\d{4}-\d{6}$/);
  });

  it("does not consume a number when issuing fails", async () => {
    const shop = await readyShop();
    const draft = await draftInvoice(shop);
    await expect(issueInvoice(shop.office, { id: draft.id, version: draft.version - 1 })).rejects.toThrow(/changed this just now/);
    const issued = await issueInvoice(shop.office, { id: draft.id, version: draft.version });
    expect(issued.number!.slice(-6)).toBe("000001");
  });

  it("calculates per-head GST on the server and freezes identity at issue", async () => {
    const shop = await readyShop();
    const draft = await draftInvoice(shop);
    const issued = await issueInvoice(shop.office, { id: draft.id, version: draft.version });
    expect(issued).toMatchObject({ status: "SENT", subtotalPaise: 130100, cgstPaise: 11709, sgstPaise: 11709, totalPaise: 153518, documentType: "TAX_INVOICE" });
    await updateCustomer(shop.office, shop.customer.id, { name: "Ravi S. (renamed)", phone: "98765 43210" });
    const reread = await getPrisma().invoice.findUniqueOrThrow({ where: { id: issued.id } });
    expect(reread.buyerSnapshot).toMatchObject({ name: "Ravi Sharma" });
    await expect(saveInvoiceDraft(shop.office, { id: issued.id, version: reread.version, lines: [line] })).rejects.toThrow(/cannot be edited/);
  });

  it("charges IGST to another state and no GST on a bill of supply", async () => {
    const shop = await readyShop();
    const tamil = await createCustomer(shop.office, { name: "Chennai Client", phone: "98840 11223", stateCode: "33" });
    const inter = await createBlankInvoice(shop.office, tamil.id);
    await saveInvoiceDraft(shop.office, { id: inter.id, version: 0, lines: [line] });
    expect(await issueInvoice(shop.office, { id: inter.id, version: 1 })).toMatchObject({ igstPaise: 23418, cgstPaise: 0, placeOfSupply: "33" });
    await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { gstScheme: "UNREGISTERED", gstin: null } });
    const plain = await draftInvoice(shop);
    expect(await issueInvoice(shop.office, { id: plain.id, version: plain.version })).toMatchObject({ documentType: "BILL_OF_SUPPLY", taxPaise: 0, totalPaise: 130100 });
  });

  it("refuses to issue without seller GST details", async () => {
    const shop = await makeShop();
    const customer = await createCustomer(shop.office, { name: "Walk-in", phone: "98765 00000" });
    const invoice = await createBlankInvoice(shop.office, customer.id);
    await saveInvoiceDraft(shop.office, { id: invoice.id, version: 0, lines: [{ ...line, code: undefined }] });
    await expect(issueInvoice(shop.office, { id: invoice.id, version: 1 })).rejects.toThrow(/GST registration type/);
  });

  it("converts a quote once, even when two people click together, and freezes it", async () => {
    const shop = await readyShop();
    const quote = await createBlankQuote(shop.office, shop.customer.id);
    await saveQuoteDraft(shop.office, { id: quote.id, version: 0, lines: [line] });
    await moveQuote(shop.office, quote.id, "SENT", 1);
    await moveQuote(shop.owner, quote.id, "ACCEPTED");
    const [first, second] = await Promise.all([convertQuote(shop.office, quote.id), convertQuote(shop.owner, quote.id)]);
    expect(first.id).toBe(second.id);
    await expect(moveQuote(shop.office, quote.id, "REJECTED")).rejects.toThrow(/cannot be marked/);
    expect((await getPrisma().quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("INVOICED");
  });

  it("sends only the quote version the sender reviewed, and freezes its tax", async () => {
    const shop = await readyShop();
    const quote = await createBlankQuote(shop.office, shop.customer.id);
    await saveQuoteDraft(shop.office, { id: quote.id, version: 0, lines: [line] });
    await saveQuoteDraft(shop.technician, { id: quote.id, version: 1, lines: [{ ...line, unitPrice: "6,505" }] });
    await expect(moveQuote(shop.office, quote.id, "SENT", 1)).rejects.toThrow(/changed this just now/);
    await moveQuote(shop.office, quote.id, "SENT", 2);
    await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { gstScheme: "UNREGISTERED", gstin: null } });
    expect(await getPrisma().quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ totalPaise: 1535180, linesJson: [expect.objectContaining({ cgst: 117090 })] });
  });

  it("stops cash from issuing a draft someone changed after it was opened", async () => {
    const shop = await readyShop();
    const draft = await draftInvoice(shop);
    await saveInvoiceDraft(shop.office, { id: draft.id, version: draft.version, lines: [{ ...line, unitPrice: "6,505" }] });
    await expect(recordPayment(shop.technician, { invoiceId: draft.id, amount: "1,535.18", method: "CASH", idempotencyKey: `stale-${draft.id}`, draftVersion: draft.version })).rejects.toThrow(/changed this just now/);
  });

  it("rejects a stale draft save", async () => {
    const shop = await readyShop();
    const quote = await createBlankQuote(shop.office, shop.customer.id);
    await saveQuoteDraft(shop.office, { id: quote.id, version: 0, lines: [line] });
    await expect(saveQuoteDraft(shop.owner, { id: quote.id, version: 0, lines: [{ ...line, unitPrice: "1" }] })).rejects.toThrow(/changed this just now/);
  });

  it("lets a technician take cash on a draft but not issue or price invoices", async () => {
    const shop = await readyShop();
    const draft = await draftInvoice(shop);
    await expect(issueInvoice(shop.technician, { id: draft.id, version: draft.version })).rejects.toBeInstanceOf(AccessError);
    await expect(saveInvoiceDraft(shop.technician, { id: draft.id, version: draft.version, lines: [line] })).rejects.toBeInstanceOf(AccessError);
    await recordPayment(shop.technician, { invoiceId: draft.id, amount: "1,535.18", method: "CASH", idempotencyKey: `tech-cash-${draft.id}`, draftVersion: draft.version });
    expect(await getPrisma().invoice.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "PAID", number: expect.stringMatching(/^TSI-/) });
  });

  it("keeps one shop's documents away from another shop", async () => {
    const shop = await readyShop();
    const other = await readyShop();
    const draft = await draftInvoice(shop);
    await expect(issueInvoice(other.owner, { id: draft.id, version: draft.version })).rejects.toThrow(/not found/);
    await expect(createBlankInvoice(other.office, shop.customer.id)).rejects.toThrow(/not found/);
  });

  it("refuses a second customer with the same mobile, however it is typed", async () => {
    const shop = await readyShop();
    await expect(createCustomer(shop.office, { name: "Ravi again", phone: "+91 98765-43210" })).rejects.toThrow(/already uses that mobile/);
  });
});
