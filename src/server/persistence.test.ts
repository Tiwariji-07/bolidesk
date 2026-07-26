import { describe, expect, it } from "vitest";
import { forWorkspace } from "./persistence";

type Customer = { id: string; workspaceId: string; name: string; phone: string; email: string | null; address: string | null; createdAt: Date };

function memoryDatabase() {
  const customers: Customer[] = [];
  const activities: { workspaceId: string; body: string }[] = [];
  let sequence = 0;
  const matches = (item: Customer, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => item[key as keyof Customer] === value);
  return {
    customers,
    activities,
    db: {
      customer: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => customers.filter((item) => matches(item, where)),
        findFirst: async ({ where }: { where: Record<string, unknown> }) => customers.find((item) => matches(item, where)) ?? null,
        findFirstOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
          const customer = customers.find((item) => matches(item, where));
          if (!customer) throw new Error("not found");
          return customer;
        },
        create: async ({ data }: { data: Omit<Customer, "id" | "createdAt"> }) => {
          const customer = { ...data, id: `customer-${++sequence}`, createdAt: new Date() };
          customers.push(customer);
          return customer;
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Customer> }) => {
          const customer = customers.find((item) => matches(item, where));
          if (!customer) return { count: 0 };
          Object.assign(customer, data);
          return { count: 1 };
        },
      },
      activity: { create: async ({ data }: { data: { workspaceId: string; body: string } }) => (activities.push(data), data) },
    },
  };
}

describe("workspace persistence", () => {
  it("never reads or updates another workspace's customer", async () => {
    const memory = memoryDatabase();
    const alpha = forWorkspace("workspace-alpha", memory.db as never);
    const beta = forWorkspace("workspace-beta", memory.db as never);
    const betaCustomer = await beta.customers.create({ name: "Private customer", phone: "+919999999999" });

    expect(await alpha.customers.list()).toEqual([]);
    await expect(alpha.customers.update(betaCustomer.id, { name: "Leaked" })).rejects.toThrow("Customer not found");
    expect((await beta.customers.get(betaCustomer.id))?.name).toBe("Private customer");
    expect(memory.activities).toEqual([{ workspaceId: "workspace-beta", body: "Customer Private customer added" }]);
  });
});
