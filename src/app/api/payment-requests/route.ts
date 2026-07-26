import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ invoiceNumber: z.string().regex(/^[A-Z]{2}-\d{4}$/), amount: z.number().int().positive().max(10_000_000) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid invoice number and amount are required." }, { status: 400 });
  const { invoiceNumber, amount } = parsed.data;
  return NextResponse.json({ url: `https://pay.demo.bolidesk.local/${invoiceNumber}?amount=${amount}`, provider: "mock" }, { status: 201 });
}
