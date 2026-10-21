import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessError, requireAccess } from "@/server/access";
import { createProviders } from "@/server/integrations/providers";
import { forWorkspace } from "@/server/persistence";

const bodySchema = z.object({ invoiceId: z.string().cuid() });

export async function POST(request: Request) {
  const membership = await requireAccess("payments.request").catch((error: unknown) => error instanceof AccessError ? error : Promise.reject(error));
  if (membership instanceof AccessError) return NextResponse.json({ error: membership.message }, { status: membership.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid invoice is required." }, { status: 400 });
  try {
    const request = await forWorkspace(membership.workspaceId).invoices.createPaymentRequest(parsed.data.invoiceId, { paymentProvider: createProviders().payments });
    return NextResponse.json({ url: request.url, provider: request.provider.toLowerCase() }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create payment request." }, { status: 400 }); }
}
