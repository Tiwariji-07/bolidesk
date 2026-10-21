import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessError, requireAccess } from "@/server/access";
import { userMessage } from "@/server/errors";
import { createProviders } from "@/server/integrations/providers";
import { createPaymentRequest } from "@/server/payments";

const bodySchema = z.object({ invoiceId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const access = await requireAccess("payments.request").catch((error: unknown) => error instanceof AccessError ? error : Promise.reject(error));
  if (access instanceof AccessError) return NextResponse.json({ error: access.message }, { status: access.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid invoice is required." }, { status: 400 });
  try {
    return NextResponse.json(await createPaymentRequest(access, parsed.data.invoiceId, createProviders().payments), { status: 201 });
  } catch (error) { return NextResponse.json({ error: userMessage(error, "Could not create payment request.") }, { status: 400 }); }
}
