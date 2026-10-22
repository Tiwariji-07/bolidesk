import { getPrisma } from "@/server/prisma";

export const dynamic = "force-dynamic";

/** For uptime monitors and the container health check: the app is up and can reach Postgres. */
export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
