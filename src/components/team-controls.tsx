"use client";

import { useState, useTransition } from "react";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInviteAction } from "@/app/team-actions";
import { CopyLink } from "./copy-link";

export function InviteMemberForm() {
  const [error, setError] = useState(""); const [link, setLink] = useState(""); const [pending, startTransition] = useTransition();
  function submit(formData: FormData) {
    setError(""); setLink("");
    startTransition(async () => {
      const result = await inviteMemberAction({ email: formData.get("email"), role: formData.get("role") });
      if (!result.ok) return setError(result.error);
      setLink(result.data!.url);
    });
  }
  return <form className="form-grid" action={submit}>
    <div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required autoComplete="off" /></div>
    <div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" name="role" defaultValue="MEMBER"><option value="ADMIN">Office: quotes, invoices, payment links</option><option value="MEMBER">Technician: jobs, customers, cash</option></select></div>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    {link && <CopyLink label="Invite link. Send it to them on WhatsApp; it is shown only once." url={link} />}
    <div className="form-actions"><button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</button></div>
  </form>;
}

export function MemberActions({ membershipId, role }: { membershipId: string; role: "ADMIN" | "MEMBER" }) {
  const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const run = (body: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => { setError(""); const result = await body(); if (!result.ok) setError(result.error ?? "Could not save."); });
  return <div className="row-end">{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions">
    <label className="sr-only" htmlFor={`role-${membershipId}`}>Role</label>
    <select id={`role-${membershipId}`} defaultValue={role} disabled={pending} onChange={(event) => run(() => changeRoleAction(membershipId, event.target.value))}><option value="ADMIN">Office</option><option value="MEMBER">Technician</option></select>
    <button className="secondary small" disabled={pending} onClick={() => { if (confirm("Remove this person? They are signed out everywhere immediately.")) run(() => removeMemberAction(membershipId)); }}>Remove</button>
  </div></div>;
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();
  return <button className="secondary small" disabled={pending} onClick={() => startTransition(async () => { await revokeInviteAction(inviteId); })}>Cancel invite</button>;
}
