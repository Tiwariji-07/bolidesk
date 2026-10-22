import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { createBlankInvoice, issueInvoice, saveInvoiceDraft } from "./billing";
import { createCustomer } from "./customers";
import { applyWhatsAppStatuses, sendInvoiceMessage, verifyMetaSignature } from "./delivery";
import type { MessagingProvider } from "./integrations/types";
import { getPrisma } from "./prisma";

function fakeWhatsApp(fail = false) {
  const sent: { to: string; template: { components?: unknown[] } }[] = [];
  const provider: MessagingProvider = {
    name: "whatsapp-cloud",
    sendTemplate: async (input) => { if (fail) throw new Error("(#131026) Message undeliverable"); sent.push(input); return { providerMessageId: `wamid.${Math.random()}`, payload: input }; },
  };
  return { provider, sent };
}

async function issued() {
  const shop = await makeShop();
  await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Shop Pvt Ltd", address: "1 MG Road", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW" } });
  const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
  const draft = await createBlankInvoice(shop.office, customer.id);
  await saveInvoiceDraft(shop.office, { id: draft.id, version: 0, lines: [{ description: "AC service", quantity: 1, unitPrice: "1000", taxRate: 18, code: "998719" }] });
  return { shop, invoice: await issueInvoice(shop.office, { id: draft.id, version: 1 }) };
}

describe("WhatsApp delivery (Postgres)", () => {
  it("sends the template to the normalized number and never stores the private link", async () => {
    const { shop, invoice } = await issued();
    const whatsapp = fakeWhatsApp();
    await sendInvoiceMessage(shop.office, invoice.id, "invoice", whatsapp.provider);
    expect(whatsapp.sent[0].to).toBe("919876543210");
    expect(JSON.stringify(whatsapp.sent[0].template.components)).toContain("/p/");
    const [log] = await getPrisma().deliveryLog.findMany({ where: { invoiceId: invoice.id } });
    expect(log).toMatchObject({ status: "SENT", purpose: "invoice" });
    expect(JSON.stringify(log.payloadJson)).not.toContain("/p/");
    await expect(sendInvoiceMessage(shop.office, invoice.id, "invoice", whatsapp.provider)).rejects.toThrow(/a moment ago/);
    await expect(sendInvoiceMessage(shop.technician, invoice.id, "reminder", whatsapp.provider)).rejects.toBeInstanceOf(AccessError);
  });

  it("logs a refused message as failed and lets staff try again", async () => {
    const { shop, invoice } = await issued();
    await expect(sendInvoiceMessage(shop.office, invoice.id, "reminder", fakeWhatsApp(true).provider)).rejects.toThrow(/did not accept/);
    expect(await getPrisma().deliveryLog.findFirst({ where: { invoiceId: invoice.id } })).toMatchObject({ status: "FAILED", error: expect.stringContaining("undeliverable") });
    await sendInvoiceMessage(shop.office, invoice.id, "reminder", fakeWhatsApp().provider);
  });

  it("moves delivery status forward only, from signed callbacks", async () => {
    const { shop, invoice } = await issued();
    await sendInvoiceMessage(shop.office, invoice.id, "invoice", fakeWhatsApp().provider);
    const log = await getPrisma().deliveryLog.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    const callback = (status: string) => ({ entry: [{ changes: [{ value: { statuses: [{ id: log.providerMessageId, status }] } }] }] });
    await applyWhatsAppStatuses(callback("read"));
    await applyWhatsAppStatuses(callback("delivered"));
    expect((await getPrisma().deliveryLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe("READ");
    const body = JSON.stringify(callback("read"));
    expect(verifyMetaSignature(body, `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body, "sha256=00", "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
  });

  it("sends one message when two people tap send at the same time", async () => {
    const { shop, invoice } = await issued();
    const whatsapp = fakeWhatsApp();
    const results = await Promise.allSettled([sendInvoiceMessage(shop.office, invoice.id, "invoice", whatsapp.provider), sendInvoiceMessage(shop.owner, invoice.id, "invoice", whatsapp.provider)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
  });
});
