import { readEnvironment } from "@/server/env";

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && token === readEnvironment().WHATSAPP_WEBHOOK_VERIFY_TOKEN) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

/** Meta delivery/status callbacks are acknowledged; inbound messaging is not enabled in this release. */
export async function POST() { return new Response(null, { status: 200 }); }
