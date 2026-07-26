import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().transform((value) => value || undefined);

export const customerInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  address: optionalText,
});

export const jobInputSchema = z.object({
  note: z.string().trim().min(8).max(2000),
  customerId: z.string().cuid().optional(),
});

export const quoteStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]);
export const invoiceNumberSchema = z.string().trim().min(3).max(50);
export const followUpInputSchema = z.object({
  subject: z.string().trim().min(3).max(240),
  action: z.string().trim().min(3).max(1000),
  dueAt: z.coerce.date(),
});
export const workspaceSettingsSchema = z.object({
  brandName: z.string().trim().min(2).max(120),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/),
  gstin: z.string().trim().max(30).optional().or(z.literal("")),
});
