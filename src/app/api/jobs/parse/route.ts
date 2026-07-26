import { NextResponse } from "next/server";
import { z } from "zod";
import { createProviders } from "@/server/integrations/providers";

const bodySchema = z.object({ note: z.string().trim().min(8).max(2000) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a job note between 8 and 2,000 characters." }, { status: 400 });
  const provider = createProviders().jobParser;
  try { return NextResponse.json({ data: await provider.parse(parsed.data.note), provider: provider.name }); } catch { return NextResponse.json({ error: "The job parser is currently unavailable." }, { status: 503 }); }
}
