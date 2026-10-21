import { redirect } from "next/navigation";
import type { MembershipRole } from "@prisma/client";
import { findSession, sessionToken, type ActiveSession } from "./session";

/** Shop meanings of the stored roles. */
export const ROLE_LABELS: Record<MembershipRole, string> = { OWNER: "Owner", ADMIN: "Office", MEMBER: "Technician" };

export type Permission =
  | "customers.write" | "jobs.write" | "quotes.draft" | "quotes.decide" | "invoices.write" | "portal.share"
  | "payments.request" | "payments.cash" | "payments.manual" | "payments.correct" | "credit.issue"
  | "followups.write" | "messages.send" | "ledger.view" | "settings.write" | "staff.manage";

const OFFICE: Permission[] = ["customers.write", "jobs.write", "quotes.draft", "quotes.decide", "invoices.write", "portal.share", "payments.request", "payments.cash", "payments.manual", "followups.write", "messages.send", "ledger.view"];
const TECHNICIAN: Permission[] = ["customers.write", "jobs.write", "quotes.draft", "payments.cash", "followups.write"];

export const ROLE_PERMISSIONS: Record<MembershipRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([...OFFICE, "payments.correct", "credit.issue", "settings.write", "staff.manage"]),
  ADMIN: new Set<Permission>(OFFICE),
  MEMBER: new Set<Permission>(TECHNICIAN),
};

export type Access = ActiveSession;

export class AccessError extends Error {
  constructor(message = "You do not have permission to do that.", readonly status = 403) {
    super(message);
  }
}

export function can(access: Pick<Access, "role">, permission: Permission) {
  return ROLE_PERMISSIONS[access.role].has(permission);
}

/** Pages: the signed-in member, or a redirect to /login. */
export async function currentAccess(): Promise<Access> {
  const session = await findSession(await sessionToken());
  if (!session) redirect("/login");
  return session;
}

/** Pages that need a permission: show the page only to roles that may use it. */
export async function pageAccess(permission: Permission): Promise<Access> {
  const access = await currentAccess();
  if (!can(access, permission)) redirect("/?error=forbidden");
  return access;
}

/** Server actions and route handlers: throws AccessError (401/403) instead of redirecting. */
export async function requireAccess(permission?: Permission): Promise<Access> {
  const session = await findSession(await sessionToken());
  if (!session) throw new AccessError("Your session has ended. Sign in again.", 401);
  if (permission && !can(session, permission)) throw new AccessError();
  return session;
}
