import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessError, requireAccess } from "@/server/access";
import { sendInvoiceMessage } from "@/server/delivery";
import { userMessage } from "@/server/errors";
import { createProviders } from "@/server/integrations/providers";

const bodySchema = z.object({ invoiceId: z.string().min(1).max(64), purpose: z.enum(["invoice", "reminder"]) });

export async function POST(request: Request) {
  const access = await requireAccess("messages.send").catch((error: unknown) => error instanceof AccessError ? error : Promise.reject(error));
  if (access instanceof AccessError) return NextResponse.json({ error: access.message }, { status: access.status });
  const input = bodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "An invoice and a purpose (invoice or reminder) are required." }, { status: 400 });
  try {
    return NextResponse.json(await sendInvoiceMessage(access, input.data.invoiceId, input.data.purpose, createProviders().messaging), { status: 201 });
  } catch (error) { return NextResponse.json({ error: userMessage(error, "Could not send the message.") }, { status: 502 }); }
}
