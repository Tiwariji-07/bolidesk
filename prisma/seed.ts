import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/server/auth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed BoliDesk.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const workspaceId = "demo-workspace";

const line = (description: string, unitPrice: number) => [{ description, quantity: 1, unitPrice, taxRate: 18 }];

async function main() {
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: "CoolCare Services", brandName: "CoolCare Services", invoicePrefix: "BD", gstin: "29AAAAA0000A1Z5" },
    create: { id: workspaceId, name: "CoolCare Services", brandName: "CoolCare Services", invoicePrefix: "BD", gstin: "29AAAAA0000A1Z5" },
  });

  const demoEmail = (process.env.DEMO_USER_EMAIL || "demo@bolidesk.local").trim().toLowerCase();
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) throw new Error("DEMO_USER_PASSWORD must be set to at least 12 characters before seeding.");
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash: await hashPassword(demoPassword) },
    create: { email: demoEmail, passwordHash: await hashPassword(demoPassword) },
  });
  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: demoUser.id, workspaceId } },
    update: { role: "OWNER" },
    create: { userId: demoUser.id, workspaceId, role: "OWNER" },
  });

  const ravi = await prisma.customer.upsert({
    where: { workspaceId_phone: { workspaceId, phone: "+91 98765 43210" } },
    update: { name: "Ravi Sharma", address: "Indiranagar, Bengaluru" },
    create: { id: "demo-customer-ravi", workspaceId, name: "Ravi Sharma", phone: "+91 98765 43210", address: "Indiranagar, Bengaluru" },
  });
  const meera = await prisma.customer.upsert({
    where: { workspaceId_phone: { workspaceId, phone: "+91 99887 22110" } },
    update: { name: "Meera Nair", address: "HSR Layout, Bengaluru" },
    create: { id: "demo-customer-meera", workspaceId, name: "Meera Nair", phone: "+91 99887 22110", address: "HSR Layout, Bengaluru" },
  });
  const aman = await prisma.customer.upsert({
    where: { workspaceId_phone: { workspaceId, phone: "+91 98100 11223" } },
    update: { name: "Aman Verma", address: "Koramangala, Bengaluru" },
    create: { id: "demo-customer-aman", workspaceId, name: "Aman Verma", phone: "+91 98100 11223", address: "Koramangala, Bengaluru" },
  });

  await prisma.job.upsert({
    where: { id: "demo-job-ravi" },
    update: { note: "Ravi Sharma, 2 AC services at 650 each, GST 18%, due 30 July 2026" },
    create: { id: "demo-job-ravi", workspaceId, customerId: ravi.id, note: "Ravi Sharma, 2 AC services at 650 each, GST 18%, due 30 July 2026", parsedJson: { customerName: "Ravi Sharma", dueDate: "2026-07-30" } },
  });

  const quote = await prisma.quote.upsert({
    where: { workspaceId_number: { workspaceId, number: "QT-1027" } },
    update: { customerId: aman.id, status: "ACCEPTED", subtotal: 4500, tax: 810, total: 5310, linesJson: line("Annual AC maintenance", 4500) },
    create: { id: "demo-quote-1027", workspaceId, customerId: aman.id, number: "QT-1027", status: "ACCEPTED", subtotal: 4500, tax: 810, total: 5310, linesJson: line("Annual AC maintenance", 4500) },
  });
  await prisma.quote.upsert({
    where: { workspaceId_number: { workspaceId, number: "QT-1028" } },
    update: { customerId: meera.id, status: "SENT", subtotal: 10000, tax: 1800, total: 11800, linesJson: line("Split AC installation", 10000) },
    create: { id: "demo-quote-1028", workspaceId, customerId: meera.id, number: "QT-1028", status: "SENT", subtotal: 10000, tax: 1800, total: 11800, linesJson: line("Split AC installation", 10000) },
  });

  await prisma.invoice.upsert({
    where: { workspaceId_number: { workspaceId, number: "BD-2047" } },
    update: { customerId: aman.id, quoteId: quote.id, status: "SENT", subtotal: 3559, tax: 641, total: 4200, dueDate: new Date("2026-07-27T00:00:00.000Z"), linesJson: line("Annual AC maintenance", 3559) },
    create: { id: "demo-invoice-2047", workspaceId, customerId: aman.id, quoteId: quote.id, number: "BD-2047", status: "SENT", subtotal: 3559, tax: 641, total: 4200, dueDate: new Date("2026-07-27T00:00:00.000Z"), linesJson: line("Annual AC maintenance", 3559) },
  });
  await prisma.invoice.upsert({
    where: { workspaceId_number: { workspaceId, number: "BD-2048" } },
    update: { customerId: ravi.id, status: "OVERDUE", subtotal: 2250, tax: 405, total: 2655, dueDate: new Date("2026-07-24T00:00:00.000Z"), linesJson: line("AC servicing & capacitor", 2250) },
    create: { id: "demo-invoice-2048", workspaceId, customerId: ravi.id, number: "BD-2048", status: "OVERDUE", subtotal: 2250, tax: 405, total: 2655, dueDate: new Date("2026-07-24T00:00:00.000Z"), linesJson: line("AC servicing & capacitor", 2250) },
  });

  await prisma.followUp.upsert({
    where: { id: "demo-follow-up-ravi" },
    update: { subject: "BD-2048 · Ravi Sharma", action: "Send a payment reminder with the link.", status: "OPEN", dueAt: new Date("2026-07-26T09:00:00.000Z") },
    create: { id: "demo-follow-up-ravi", workspaceId, subject: "BD-2048 · Ravi Sharma", action: "Send a payment reminder with the link.", status: "OPEN", dueAt: new Date("2026-07-26T09:00:00.000Z") },
  });
  await prisma.activity.upsert({
    where: { id: "demo-activity-reminder" },
    update: { body: "Payment reminder prepared for Ravi Sharma" },
    create: { id: "demo-activity-reminder", workspaceId, body: "Payment reminder prepared for Ravi Sharma" },
  });

  console.log("Seeded BoliDesk demo workspace.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
