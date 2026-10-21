import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { createBlankInvoice, issueInvoice, saveInvoiceDraft } from "./billing";
import { createCustomer } from "./customers";
import { completeFollowUp, ensureOverdueFollowUps, snoozeFollowUp } from "./followups";
import { recordPayment, reversePayment } from "./payments";
import { getPrisma } from "./prisma";

async function invoiceDue(dueDate: string) {
  const shop = await makeShop();
  await getPrisma().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Shop Pvt Ltd", address: "1 MG Road", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW" } });
  const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
  const draft = await createBlankInvoice(shop.office, customer.id);
  await saveInvoiceDraft(shop.office, { id: draft.id, version: 0, dueDate, lines: [{ description: "AC service", quantity: 1, unitPrice: "1000", taxRate: 18, code: "998719" }] });
  return { shop, invoice: await issueInvoice(shop.office, { id: draft.id, version: 1 }) };
}

const followUps = (workspaceId: string) => getPrisma().followUp.findMany({ where: { workspaceId } });
const at = (iso: string) => new Date(iso);

describe("automatic follow-ups (Postgres)", () => {
  it("creates one reminder per overdue invoice, at 9:00 IST the next day, and not while still due", async () => {
    const { shop, invoice } = await invoiceDue("2026-10-20");
    await ensureOverdueFollowUps(shop.workspace.id, at("2026-10-20T17:00:00.000Z"));
    expect(await followUps(shop.workspace.id)).toHaveLength(0);
    await Promise.all([ensureOverdueFollowUps(shop.workspace.id, at("2026-10-20T18:31:00.000Z")), ensureOverdueFollowUps(shop.workspace.id, at("2026-10-20T19:31:00.000Z"))]);
    expect(await followUps(shop.workspace.id)).toMatchObject([{ invoiceId: invoice.id, status: "OPEN", dueAt: at("2026-10-21T03:30:00.000Z") }]);
  });

  it("closes the reminder when paid and reopens it if the payment is reversed", async () => {
    const { shop, invoice } = await invoiceDue("2026-01-01");
    await ensureOverdueFollowUps(shop.workspace.id);
    const cash = await recordPayment(shop.technician, { invoiceId: invoice.id, amount: "1180", method: "CASH", idempotencyKey: `fu-${invoice.id}` });
    expect(await followUps(shop.workspace.id)).toMatchObject([{ status: "DONE", completedAutomatically: true }]);
    await reversePayment(shop.owner, cash.paymentId, "bounced");
    expect(await followUps(shop.workspace.id)).toMatchObject([{ status: "OPEN" }]);
  });

  it("leaves a reminder a person finished alone, and snoozes to 9:00 IST tomorrow", async () => {
    const { shop } = await invoiceDue("2026-01-01");
    await ensureOverdueFollowUps(shop.workspace.id);
    const [followUp] = await followUps(shop.workspace.id);
    await snoozeFollowUp(shop.technician, followUp.id, at("2026-10-20T19:00:00.000Z"));
    expect((await followUps(shop.workspace.id))[0]).toMatchObject({ status: "SNOOZED", dueAt: at("2026-10-22T03:30:00.000Z") });
    await completeFollowUp(shop.technician, followUp.id);
    await ensureOverdueFollowUps(shop.workspace.id, new Date(Date.now() + 120_000));
    expect(await followUps(shop.workspace.id)).toMatchObject([{ status: "DONE", completedAutomatically: false }]);
  });
});
