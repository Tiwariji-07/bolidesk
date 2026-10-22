import { z } from "zod";
import { ALLOWED_RATES, isValidGstin, STATES, type GstRateProfile } from "@/domain/gst";
import { normalizePhone } from "@/domain/phone";
import type { Access } from "./access";
import { UserError } from "./errors";
import { logActivity, withStaffLock, type Tx } from "./workspace-tx";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

export const customerInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(120),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(255).optional().transform((value) => value || null).refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email or leave it empty."),
  address: optionalText(500),
  stateCode: z.string().optional().transform((value) => value || null).refine((value) => !value || Boolean(STATES[value]), "Choose a valid state."),
  gstin: z.string().trim().toUpperCase().optional().transform((value) => value || null).refine((value) => !value || isValidGstin(value), "That GSTIN is not valid. Check it on the GST portal."),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

function prepare(input: z.output<typeof customerInputSchema>) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError("Enter a valid mobile number, for example 98765 43210.");
  // A registered buyer's state is the first two digits of their GSTIN.
  return { ...input, phone, stateCode: input.gstin ? input.gstin.slice(0, 2) : input.stateCode };
}

async function duplicatePhone(tx: Tx, workspaceId: string, phone: string, exceptId?: string) {
  const existing = await tx.customer.findFirst({ where: { workspaceId, phone, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
  if (existing) throw new UserError(`${existing.name} already uses that mobile number.`);
}

export function createCustomer(access: Access, raw: CustomerInput) {
  const data = prepare(customerInputSchema.parse(raw));
  return withStaffLock(access, "customers.write", async (tx, actor) => {
    await duplicatePhone(tx, actor.workspaceId, data.phone);
    const customer = await tx.customer.create({ data: { workspaceId: actor.workspaceId, ...data } });
    await logActivity(tx, actor, `Customer ${customer.name} added`);
    return customer;
  });
}

/** Editing a customer never changes an issued invoice: those carry a frozen buyer snapshot. */
export function updateCustomer(access: Access, id: string, raw: CustomerInput) {
  const data = prepare(customerInputSchema.parse(raw));
  return withStaffLock(access, "customers.write", async (tx, actor) => {
    if (!(await tx.customer.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } }))) throw new UserError("Customer not found.");
    await duplicatePhone(tx, actor.workspaceId, data.phone, id);
    const customer = await tx.customer.update({ where: { id }, data });
    await logActivity(tx, actor, `Customer ${customer.name} updated`);
    return customer;
  });
}

export const settingsInputSchema = z.object({
  brandName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2, "Enter the legal business name.").max(160),
  address: z.string().trim().min(5, "Enter the business address.").max(500),
  stateCode: z.string().refine((value) => Boolean(STATES[value]), "Choose your state."),
  gstScheme: z.enum(["REGULAR", "COMPOSITION", "UNREGISTERED"]),
  gstin: z.string().trim().toUpperCase().optional().transform((value) => value || null),
  gstRateProfile: z.enum(["REFORM_2025", "LEGACY_2017"]),
  defaultTaxRate: z.coerce.number(),
  defaultCode: z.string().trim().optional().transform((value) => value || null).refine((value) => !value || /^(?:\d{4}|\d{6}|\d{8})$/.test(value), "SAC/HSN must be 4, 6 or 8 digits."),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, "Use 1–3 letters or digits for the document prefix."),
  upiId: z.string().trim().optional().transform((value) => value || null).refine((value) => !value || /^[\w.-]{2,256}@[a-zA-Z][\w.-]{1,63}$/.test(value), "Enter a UPI ID like shopname@okhdfcbank."),
});
export type SettingsInput = z.input<typeof settingsInputSchema>;

export function updateSettings(access: Access, raw: SettingsInput) {
  const input = settingsInputSchema.parse(raw);
  if (input.gstScheme !== "UNREGISTERED" && (!input.gstin || !isValidGstin(input.gstin))) throw new UserError("Enter a valid GSTIN for a registered business.");
  if (input.gstin && input.gstin.slice(0, 2) !== input.stateCode) throw new UserError("Your GSTIN starts with a different state code than the state you chose.");
  if (!ALLOWED_RATES[input.gstRateProfile as GstRateProfile].includes(input.defaultTaxRate)) throw new UserError(`Default GST rate must be one of ${ALLOWED_RATES[input.gstRateProfile as GstRateProfile].join("%, ")}%.`);
  return withStaffLock(access, "settings.write", async (tx, actor) => {
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId } });
    if (workspace.invoicePrefix !== input.invoicePrefix && (await tx.documentCounter.count({ where: { workspaceId: actor.workspaceId } })) > 0) throw new UserError("The document prefix is fixed once a numbered document exists, so the series stays consecutive.");
    await tx.workspace.update({ where: { id: actor.workspaceId }, data: { ...input, gstin: input.gstScheme === "UNREGISTERED" ? null : input.gstin } });
    await logActivity(tx, actor, "Business settings updated");
  });
}
