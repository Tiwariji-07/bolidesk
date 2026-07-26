import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/server/razorpay-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await processRazorpayWebhook(await request.text(), request.headers.get("x-razorpay-signature"));
  return NextResponse.json(result.body, { status: result.status });
}
