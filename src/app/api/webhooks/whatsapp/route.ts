import { timingSafeEqual } from "node:crypto";
import { applyWhatsAppStatuses, verifyMetaSignature } from "@/server/delivery";
import { readEnvironment } from "@/server/env";

export const runtime = "nodejs";

function sameSecret(a: string | null, b: string | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Meta's subscription handshake. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("hub.challenge");
  if (url.searchParams.get("hub.mode") === "subscribe" && challenge && sameSecret(url.searchParams.get("hub.verify_token"), readEnvironment().WHATSAPP_WEBHOOK_VERIFY_TOKEN)) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

/** Delivery statuses, accepted only with a valid X-Hub-Signature-256 from the configured app secret. */
export async function POST(request: Request) {
  const secret = readEnvironment().WHATSAPP_APP_SECRET;
  const raw = await request.text();
  if (!secret || !verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) return new Response("Forbidden", { status: 403 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
  await applyWhatsAppStatuses(payload);
  return new Response(null, { status: 200 });
}
