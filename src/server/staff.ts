import { createHash, randomBytes } from "node:crypto";
import type { MembershipRole } from "@prisma/client";
import { ROLE_LABELS, type Access } from "./access";
import { authenticateUser, hashPassword, loginThrottle, normalizeEmail } from "./auth";
import { publicAppUrl } from "./env";
import { ConflictError, UserError } from "./errors";
import { getPrisma } from "./prisma";
import { revokeMembershipSessions } from "./session";
import { logActivity, withStaffLock, withSystemLock } from "./workspace-tx";

const INVITE_LIFETIME_MS = 72 * 60 * 60 * 1000;
export type StaffRole = Exclude<MembershipRole, "OWNER">;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function listTeam(workspaceId: string) {
  const db = getPrisma();
  return Promise.all([
    db.membership.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, createdAt: true, user: { select: { email: true, name: true } }, sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 } } }),
    db.workspaceInvite.findMany({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true } }),
  ]);
}

/** Owner creates a single-use link to share (for example on WhatsApp). The raw token is returned once and never stored. */
export async function inviteMember(access: Access, input: { email: string; role: StaffRole }) {
  const email = normalizeEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  await withStaffLock(access, "staff.manage", async (tx, actor) => {
    const existing = await tx.membership.findFirst({ where: { workspaceId: actor.workspaceId, user: { email } } });
    if (existing) throw new UserError("That person is already on your team.");
    const data = { role: input.role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS), acceptedAt: null, revokedAt: null, createdByUserId: actor.userId! };
    await tx.workspaceInvite.upsert({ where: { workspaceId_email: { workspaceId: actor.workspaceId, email } }, create: { workspaceId: actor.workspaceId, email, ...data }, update: data });
    await logActivity(tx, actor, `Invited ${email} as ${ROLE_LABELS[input.role]}`);
  });
  return { url: `${publicAppUrl()}/invite/${token}` };
}

export function revokeInvite(access: Access, inviteId: string) {
  return withStaffLock(access, "staff.manage", async (tx, actor) => {
    const result = await tx.workspaceInvite.updateMany({ where: { id: inviteId, workspaceId: actor.workspaceId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new UserError("Invite not found.");
    await logActivity(tx, actor, "Invite cancelled");
  });
}

export function changeMemberRole(access: Access, membershipId: string, role: StaffRole) {
  return withStaffLock(access, "staff.manage", async (tx, actor) => {
    const member = await tx.membership.findFirst({ where: { id: membershipId, workspaceId: actor.workspaceId }, include: { user: { select: { email: true } } } });
    if (!member) throw new UserError("Team member not found.");
    if (member.role === "OWNER") throw new UserError("The owner's role cannot be changed here.");
    if (member.role === role) return;
    await tx.membership.update({ where: { id: member.id }, data: { role } });
    await revokeMembershipSessions(tx, member.id);
    await logActivity(tx, actor, `${member.user.email} is now ${ROLE_LABELS[role]}`);
  });
}

/** Removal deletes the membership; its sessions cascade, so the person is signed out everywhere at once. */
export function removeMember(access: Access, membershipId: string) {
  return withStaffLock(access, "staff.manage", async (tx, actor) => {
    const member = await tx.membership.findFirst({ where: { id: membershipId, workspaceId: actor.workspaceId }, include: { user: { select: { email: true } } } });
    if (!member) throw new UserError("Team member not found.");
    if (member.role === "OWNER") throw new UserError("The owner cannot be removed.");
    await tx.membership.delete({ where: { id: member.id } });
    await logActivity(tx, actor, `${member.user.email} removed from the team`);
  });
}

export async function findInvite(token: string) {
  const invite = await getPrisma().workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) }, select: { email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, workspace: { select: { name: true } } } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  const hasAccount = Boolean(await getPrisma().user.findUnique({ where: { email: invite.email }, select: { id: true } }));
  return { email: invite.email, role: invite.role, workspaceName: invite.workspace.name, hasAccount };
}

/**
 * New users choose a password; existing users prove theirs (an invite never resets a password).
 * The invite is consumed with a conditional update so two clicks cannot create two memberships.
 */
export async function acceptInvite(input: { token: string; password: string; name?: string }) {
  const db = getPrisma();
  const tokenHash = hashToken(input.token);
  const invite = await db.workspaceInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) throw new UserError("This invite link is no longer valid. Ask the owner for a new one.");
  const existing = await db.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    // Same throttle as sign-in, so an invite cannot be used to guess another account's password.
    if (loginThrottle.blocked(invite.email)) throw new UserError("Too many attempts. Wait 15 minutes and try again.");
    if (!(await authenticateUser(db, invite.email, input.password))) {
      loginThrottle.fail(invite.email);
      throw new UserError("That password does not match your existing BoliDesk account.");
    }
    loginThrottle.clear(invite.email);
  }
  const passwordHash = existing ? null : await hashPassword(input.password);
  return withSystemLock(invite.workspaceId, async (tx) => {
    const consumed = await tx.workspaceInvite.updateMany({ where: { id: invite.id, tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (consumed.count !== 1) throw new ConflictError("This invite was already used.");
    const user = existing ?? await tx.user.create({ data: { email: invite.email, name: input.name?.trim() || null, passwordHash: passwordHash! } });
    const membership = await tx.membership.create({ data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role } });
    await tx.activity.create({ data: { workspaceId: invite.workspaceId, actorUserId: user.id, body: `${invite.email} joined as ${ROLE_LABELS[invite.role]}` } });
    return { membershipId: membership.id };
  });
}
