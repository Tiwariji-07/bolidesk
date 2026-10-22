import { isIsoDate } from "@/domain/business-time";
import { AccessError, requireAccess } from "@/server/access";
import { salesRegisterCsv } from "@/server/reports";

/** GET /reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD, with `to` exclusive (e.g. the first day of the next month). */
export async function GET(request: Request) {
  const access = await requireAccess("ledger.view").catch((error: unknown) => error instanceof AccessError ? error : Promise.reject(error));
  if (access instanceof AccessError) return new Response(access.message, { status: access.status });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(toParam) || toParam < from) return new Response("Use from and to as YYYY-MM-DD.", { status: 400 });
  const to = new Date(new Date(`${toParam}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const csv = await salesRegisterCsv(access.workspaceId, from, to < from ? from : to);
  return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-register-${from}.csv"`, "Cache-Control": "private, no-store" } });
}
