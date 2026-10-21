"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/server/access";
import { attempt, UserError } from "@/server/errors";
import { changeMemberRole, inviteMember, removeMember, revokeInvite } from "@/server/staff";

const role = z.enum(["ADMIN", "MEMBER"]);

export async function inviteMemberAction(values: unknown) {
  return attempt(async () => {
    const input = z.object({ email: z.email(), role }).safeParse(values);
    if (!input.success) throw new UserError("Enter an email and choose Office or Technician.");
    const invite = await inviteMember(await requireAccess("staff.manage"), input.data);
    revalidatePath("/settings/team");
    return invite;
  });
}

export async function changeRoleAction(membershipId: string, value: unknown) {
  return attempt(async () => {
    const parsed = role.safeParse(value);
    if (!parsed.success) throw new UserError("Choose Office or Technician.");
    await changeMemberRole(await requireAccess("staff.manage"), membershipId, parsed.data);
    revalidatePath("/settings/team");
  });
}

export async function removeMemberAction(membershipId: string) {
  return attempt(async () => {
    await removeMember(await requireAccess("staff.manage"), membershipId);
    revalidatePath("/settings/team");
  });
}

export async function revokeInviteAction(inviteId: string) {
  return attempt(async () => {
    await revokeInvite(await requireAccess("staff.manage"), inviteId);
    revalidatePath("/settings/team");
  });
}
