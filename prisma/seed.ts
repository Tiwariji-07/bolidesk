import "dotenv/config";
import { randomBytes } from "node:crypto";
import { addDays, businessDate } from "../src/domain/business-time";
import type { Access } from "../src/server/access";
import { hashPassword } from "../src/server/auth";
import { convertQuote, createQuoteFromJob, issueInvoice, moveQuote, saveInvoiceDraft, saveJob } from "../src/server/billing";
import { createCustomer } from "../src/server/customers";
import { createFollowUp } from "../src/server/followups";
import { createProviders } from "../src/server/integrations/providers";
import { recordPayment } from "../src/server/payments";
import { getPrisma } from "../src/server/prisma";
import { hashSessionToken } from "../src/server/session";

const workspaceId = "demo-workspace";

/** Demo data goes through the same commands staff use, so numbers, totals and snapshots follow the real rules. */
async function main() {
  const prisma = getPrisma();
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, name: "CoolCare Services", brandName: "CoolCare Services", legalName: "CoolCare Services Private Limited", address: "14, 80 Feet Road, Indiranagar, Bengaluru 560038", stateCode: "29", gstScheme: "REGULAR", gstin: "29ABCDE1234F1ZW", defaultTaxRate: 18, defaultCode: "998719", invoicePrefix: "BD", upiId: "coolcare@okhdfcbank" },
  });

  const demoEmail = (process.env.DEMO_USER_EMAIL || "demo@bolidesk.local").trim().toLowerCase();
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) throw new Error("DEMO_USER_PASSWORD must be set to at least 12 characters before seeding.");
  const demoUser = await prisma.user.upsert({ where: { email: demoEmail }, update: { passwordHash: await hashPassword(demoPassword) }, create: { email: demoEmail, name: "Demo Owner", passwordHash: await hashPassword(demoPassword) } });
  const membership = await prisma.membership.upsert({ where: { userId_workspaceId: { userId: demoUser.id, workspaceId } }, update: { role: "OWNER" }, create: { userId: demoUser.id, workspaceId, role: "OWNER" } });

  if (await prisma.customer.count({ where: { workspaceId } })) {
    console.log("Demo workspace already has data; left it unchanged.");
    return;
  }

  // A short-lived server-side session for the seed itself, revoked at the end.
  const session = await prisma.session.create({ data: { tokenHash: hashSessionToken(randomBytes(32).toString("base64url")), membershipId: membership.id, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const owner: Access = { sessionId: session.id, membershipId: membership.id, userId: demoUser.id, workspaceId, role: "OWNER", workspaceName: "CoolCare Services", email: demoEmail, name: "Demo Owner" };
  const parser = createProviders({ env: { DEMO_MODE: true } as never }).jobParser;
  const today = businessDate();

  const ravi = await createCustomer(owner, { name: "Ravi Sharma", phone: "98765 43210", address: "Indiranagar, Bengaluru" });
  const meera = await createCustomer(owner, { name: "Meera Nair", phone: "99887 22110", address: "HSR Layout, Bengaluru" });
  const aman = await createCustomer(owner, { name: "Aman Verma", phone: "98100 11223", address: "Koramangala, Bengaluru" });

  // Ravi: job -> quote -> accepted -> invoice issued, due last week (overdue).
  const raviJob = await saveJob(owner, { note: "Ravi Sharma, 2 AC services at 650 each, 1 capacitor at 950, GST 18%", customerId: ravi.id }, parser);
  const raviQuote = await createQuoteFromJob(owner, raviJob.job.id);
  await moveQuote(owner, raviQuote.id, "SENT");
  await moveQuote(owner, raviQuote.id, "ACCEPTED");
  const raviDraft = await convertQuote(owner, raviQuote.id);
  await saveInvoiceDraft(owner, { id: raviDraft.id, version: raviDraft.version, dueDate: addDays(today, -7), lines: [{ description: "AC service", quantity: 2, unitPrice: "650", taxRate: 18, code: "998719" }, { description: "Capacitor", quantity: 1, unitPrice: "950", taxRate: 18, code: "998719" }] });
  const raviInvoice = await issueInvoice(owner, { id: raviDraft.id, version: raviDraft.version + 1 });
  await createFollowUp(owner, { subject: `${raviInvoice.number} · Ravi Sharma`, action: "Send a payment reminder with the link.", dueAt: new Date() });

  // Aman: annual maintenance, invoiced and paid.
  const amanJob = await saveJob(owner, { note: "Aman Verma, annual AC maintenance at 4,500, GST 18%", customerId: aman.id }, parser);
  const amanQuote = await createQuoteFromJob(owner, amanJob.job.id);
  await moveQuote(owner, amanQuote.id, "SENT");
  await moveQuote(owner, amanQuote.id, "ACCEPTED");
  const amanDraft = await convertQuote(owner, amanQuote.id);
  await recordPayment(owner, { invoiceId: amanDraft.id, amount: "5,310", method: "CASH", idempotencyKey: "seed-aman-cash" });

  // Meera: installation quote sent and waiting.
  const meeraJob = await saveJob(owner, { note: "Meera Nair, split AC installation at 10,000, copper piping at Rs 1,800, GST 18%", customerId: meera.id }, parser);
  const meeraQuote = await createQuoteFromJob(owner, meeraJob.job.id);
  await moveQuote(owner, meeraQuote.id, "SENT");

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  console.log("Seeded the CoolCare demo workspace.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
