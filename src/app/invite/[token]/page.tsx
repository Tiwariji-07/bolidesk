import type { Metadata } from "next";
import { InviteForm } from "@/components/invite-form";
import { ROLE_LABELS } from "@/server/access";
import { findInvite } from "@/server/staff";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvite(token);
  return <main id="main-content" className="auth-page"><section className="auth-card"><p className="brand"><span aria-hidden="true">●</span> BoliDesk</p>
    {invite ? <><p className="eyebrow">Join {invite.workspaceName}</p><h1>You are invited as {ROLE_LABELS[invite.role]}</h1><InviteForm token={token} email={invite.email} hasAccount={invite.hasAccount} /></>
      : <><h1>This invite has expired</h1><p className="muted">Invite links work once and expire after 3 days. Ask the shop owner to send a new one.</p></>}
  </section></main>;
}
