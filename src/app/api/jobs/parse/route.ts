import { NextResponse } from "next/server";
import { z } from "zod";
import { localJobNoteParser } from "@/domain/job-note";

const bodySchema = z.object({ note: z.string().trim().min(8).max(2000) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a job note between 8 and 2,000 characters." }, { status: 400 });
  return NextResponse.json({ data: localJobNoteParser.parse(parsed.data.note), provider: "local-demo" });
}
