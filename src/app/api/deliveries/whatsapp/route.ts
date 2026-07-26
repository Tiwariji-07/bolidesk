import { NextResponse } from "next/server";
import { z } from "zod";
import { currentWorkspaceId } from "@/server/current-workspace";
import { sendInvoiceWhatsApp } from "@/server/delivery";

const bodySchema = z.object({ invoiceId: z.string().cuid(), text: z.string().trim().min(1).max(4096).optional(), template: z.object({ name: z.string().trim().min(1).max(512), languageCode: z.string().trim().min(2).max(20), components: z.array(z.unknown()).optional() }).optional() }).refine((value) => value.text || value.template, "Provide text or a template.");

export async function POST(request: Request) {
  const input = bodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "A valid invoice plus message or template is required." }, { status: 400 });
  try {
    const log = await sendInvoiceWhatsApp({ workspaceId: await currentWorkspaceId(), ...input.data });
    return NextResponse.json({ id: log.id, status: log.status }, { status: log.status === "SENT" ? 201 : 502 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare delivery." }, { status: 404 }); }
}
