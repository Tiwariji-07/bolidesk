import { describe, expect, it } from "vitest";
import { makeShop } from "@/test/fixtures";
import { AccessError } from "./access";
import { saveJob } from "./billing";
import { createCustomer } from "./customers";
import { createProviders } from "./integrations/providers";
import { readEnvironment } from "./env";
import { scheduleJob, setJobStatus } from "./jobs";
import { getPrisma } from "./prisma";

const parser = createProviders({ env: readEnvironment({ DEMO_MODE: "true" }) }).jobParser;

describe("jobs (Postgres)", () => {
  it("lets the office assign a technician from this shop only, who can close their own visit", async () => {
    const shop = await makeShop();
    const other = await makeShop("Other");
    const customer = await createCustomer(shop.office, { name: "Ravi", phone: "98765 43210" });
    const { job } = await saveJob(shop.technician, { note: "Ravi, AC not cooling, visit tomorrow", customerId: customer.id }, parser);
    await expect(scheduleJob(shop.technician, job.id, { assigneeUserId: shop.technician.userId, scheduledAt: null })).rejects.toBeInstanceOf(AccessError);
    await expect(scheduleJob(shop.office, job.id, { assigneeUserId: other.technician.userId, scheduledAt: null })).rejects.toThrow(/not on your team/);
    const visit = new Date("2026-10-22T05:00:00.000Z");
    await scheduleJob(shop.office, job.id, { assigneeUserId: shop.technician.userId, scheduledAt: visit });
    expect(await getPrisma().job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SCHEDULED", assigneeUserId: shop.technician.userId, scheduledAt: visit });
    await expect(setJobStatus(shop.technician, job.id, "CANCELLED")).rejects.toBeInstanceOf(AccessError);
    await setJobStatus(shop.technician, job.id, "DONE");
    expect(await getPrisma().job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", doneAt: expect.any(Date) });
    await setJobStatus(shop.office, job.id, "OPEN");
    expect((await getPrisma().job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SCHEDULED");
  });

  it("stops a technician closing someone else's visit", async () => {
    const shop = await makeShop();
    const { job } = await saveJob(shop.office, { note: "Gas refill at the bakery" }, parser);
    await scheduleJob(shop.office, job.id, { assigneeUserId: shop.office.userId, scheduledAt: null });
    await expect(setJobStatus(shop.technician, job.id, "DONE")).rejects.toThrow(/someone else's job/);
  });

  it("gives a technician's own note to them", async () => {
    const shop = await makeShop();
    const { job } = await saveJob(shop.technician, { note: "Fridge gas leak at the dhaba" }, parser);
    expect(job.assigneeUserId).toBe(shop.technician.userId);
    const { job: officeJob } = await saveJob(shop.office, { note: "Office note for later" }, parser);
    expect(officeJob.assigneeUserId).toBeNull();
  });
});
