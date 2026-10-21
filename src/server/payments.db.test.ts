import { describe, expect, it } from "vitest";
import { FakeRazorpay } from "@/test/fake-razorpay";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { createBlankInvoice, issueInvoice, saveInvoiceDraft } from "./billing";
import { createCustomer } from "./customers";
import { applyWebhookEvent, createPaymentRequest, recordPayment, recordRefund, reversePayment } from "./payments";
import { getPrisma } from "./prisma";

const db = () => getPrisma();
let keys = 0;
const key = () => `test-key-${Date.now()}-${++keys}`;

/** An issued ₹1,180 invoice (₹1,000 + 18% GST) in a fully configured shop. */
async function issuedInvoice() {
  const shop = await makeShop();
  await db().workspace.update({ where: { id: shop.workspace.id }, data: { legalName: "Test Shop Pvt Ltd", address: "1 MG Road", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW" } });
  const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
  const draft = await createBlankInvoice(shop.office, customer.id);
  await saveInvoiceDraft(shop.office, { id: draft.id, version: 0, lines: [{ description: "AC service", quantity: 1, unitPrice: "1000", taxRate: 18, code: "998719" }] });
  const invoice = await issueInvoice(shop.office, { id: draft.id, version: 1 });
  return { shop, invoice };
}

const findRequest = (linkId: string, reference: string | null) => db().paymentRequest.findFirst({ where: { OR: [{ providerPaymentLinkId: linkId }, ...(reference ? [{ reference }] : [])] }, select: { id: true, workspaceId: true, status: true } });
const status = async (invoiceId: string) => (await db().invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status;

describe("payments ledger (Postgres)", () => {
  it("takes part payments with numbered receipts and settles at zero", async () => {
    const { shop, invoice } = await issuedInvoice();
    const first = await recordPayment(shop.technician, { invoiceId: invoice.id, amount: "500", method: "CASH", idempotencyKey: key() });
    expect(first).toMatchObject({ duePaise: 68000, receiptNumber: expect.stringMatching(/^BDR-\d{4}-000001$/) });
    expect(await status(invoice.id)).toBe("SENT");
    await recordPayment(shop.office, { invoiceId: invoice.id, amount: "680", method: "UPI", reference: "UTR123", idempotencyKey: key() });
    expect(await status(invoice.id)).toBe("PAID");
    await expect(recordPayment(shop.office, { invoiceId: invoice.id, amount: "1", method: "CASH", idempotencyKey: key() })).rejects.toThrow(/Only ₹0 is due/);
  });

  it("records a double-tapped payment once", async () => {
    const { shop, invoice } = await issuedInvoice();
    const same = key();
    const results = await Promise.all([1, 2, 3].map(() => recordPayment(shop.technician, { invoiceId: invoice.id, amount: "1180", method: "CASH", idempotencyKey: same })));
    expect(new Set(results.map((result) => result.paymentId)).size).toBe(1);
    expect(await db().payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });

  it("keeps technicians to cash and corrections to the owner", async () => {
    const { shop, invoice } = await issuedInvoice();
    await expect(recordPayment(shop.technician, { invoiceId: invoice.id, amount: "100", method: "UPI", reference: "x", idempotencyKey: key() })).rejects.toBeInstanceOf(AccessError);
    const cash = await recordPayment(shop.technician, { invoiceId: invoice.id, amount: "1180", method: "CASH", idempotencyKey: key() });
    await expect(reversePayment(shop.office, cash.paymentId, "wrong invoice")).rejects.toBeInstanceOf(AccessError);
    await reversePayment(shop.owner, cash.paymentId, "wrong invoice");
    expect(await status(invoice.id)).toBe("SENT");
    await expect(reversePayment(shop.owner, cash.paymentId, "again")).rejects.toThrow(/already reversed/);
  });

  it("creates one live link for simultaneous requests, then reuses it", async () => {
    const { shop, invoice } = await issuedInvoice();
    const razorpay = new FakeRazorpay();
    const results = await Promise.allSettled([createPaymentRequest(shop.office, invoice.id, razorpay), createPaymentRequest(shop.owner, invoice.id, razorpay)]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(razorpay.links.size).toBe(1);
    const again = await createPaymentRequest(shop.office, invoice.id, razorpay);
    expect(again.url).toBe([...razorpay.links.values()][0].url);
    expect(razorpay.links.size).toBe(1);
    const [link] = [...razorpay.links.values()];
    expect(link.amount).toBe(118000);
    expect(link.expireBy * 1000).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it("recovers a link whose creation timed out instead of creating a second one blindly", async () => {
    const { shop, invoice } = await issuedInvoice();
    const razorpay = new FakeRazorpay();
    razorpay.failNextCreate = "timeout-after-create";
    await expect(createPaymentRequest(shop.office, invoice.id, razorpay)).rejects.toThrow(/Could not confirm/);
    expect(await db().paymentRequest.findFirst({ where: { invoiceId: invoice.id } })).toMatchObject({ status: "PENDING" });
    const result = await createPaymentRequest(shop.office, invoice.id, razorpay);
    const live = [...razorpay.links.values()].filter((link) => link.status === "created");
    expect(live).toHaveLength(1);
    expect(result.url).toBe(live[0].url);
    expect([...razorpay.links.values()].filter((link) => link.status === "cancelled")).toHaveLength(1);
  });

  it("records a webhook payment once, even when Razorpay delivers it twice at the same time", async () => {
    const { shop, invoice } = await issuedInvoice();
    const razorpay = new FakeRazorpay();
    await createPaymentRequest(shop.office, invoice.id, razorpay);
    const event = razorpay.pay([...razorpay.links.keys()][0]);
    const responses = await Promise.all([applyWebhookEvent(razorpay, event, findRequest), applyWebhookEvent(razorpay, event, findRequest)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await db().payment.findMany({ where: { invoiceId: invoice.id } })).toMatchObject([{ source: "RAZORPAY", amountPaise: 118000, receiptNumber: expect.stringMatching(/^BDR-/) }]);
    expect(await status(invoice.id)).toBe("PAID");
    expect(await db().paymentRequest.findFirst({ where: { invoiceId: invoice.id } })).toMatchObject({ status: "PAID" });
  });

  it("cancels a link that asks for too much after cash, and still records money paid on it", async () => {
    const { shop, invoice } = await issuedInvoice();
    const razorpay = new FakeRazorpay();
    await createPaymentRequest(shop.office, invoice.id, razorpay);
    const [linkId] = [...razorpay.links.keys()];
    await recordPayment(shop.technician, { invoiceId: invoice.id, amount: "180", method: "CASH", idempotencyKey: key() }, razorpay);
    expect(razorpay.links.get(linkId)!.status).toBe("cancelled");
    // The customer had the old link open and paid it anyway: the money is recorded and shows as refund due.
    const late = razorpay.pay(linkId);
    expect((await applyWebhookEvent(razorpay, late, findRequest)).status).toBe(200);
    const payments = await db().payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.reduce((sum, payment) => sum + payment.amountPaise, 0)).toBe(136000);
    await expect(recordRefund(shop.office, { invoiceId: invoice.id, amount: "180", method: "CASH", reference: "", reason: "overpaid" })).rejects.toBeInstanceOf(AccessError);
    await recordRefund(shop.owner, { invoiceId: invoice.id, amount: "180", method: "CASH", reference: "", reason: "overpaid" });
    expect(await status(invoice.id)).toBe("PAID");
  });

  it("asks Razorpay to retry an unknown link and refuses a payment larger than the link", async () => {
    const { shop, invoice } = await issuedInvoice();
    const razorpay = new FakeRazorpay();
    expect((await applyWebhookEvent(razorpay, { kind: "payment", linkId: "plink_unknown", reference: "PRNOPE", linkStatus: "paid", payment: { id: "pay_x", amount: 1, currency: "INR", status: "captured" } }, findRequest)).status).toBe(409);
    await createPaymentRequest(shop.office, invoice.id, razorpay);
    const event = razorpay.pay([...razorpay.links.keys()][0], 999_999);
    await applyWebhookEvent(razorpay, event, findRequest);
    expect(await db().payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await db().activity.findFirst({ where: { workspaceId: shop.workspace.id, body: { contains: "needs review" } } })).not.toBeNull();
  });

  it("never creates a link for a draft or a paid invoice", async () => {
    const { shop, invoice } = await issuedInvoice();
    await recordPayment(shop.office, { invoiceId: invoice.id, amount: "1180", method: "CASH", idempotencyKey: key() });
    await expect(createPaymentRequest(shop.office, invoice.id, new FakeRazorpay())).rejects.toThrow(/Nothing is due/);
  });
});
