import { InviteMemberForm, MemberActions, RevokeInviteButton } from "@/components/team-controls";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { pageAccess, ROLE_LABELS } from "@/server/access";
import { listTeam } from "@/server/staff";

export default async function TeamPage() {
  const access = await pageAccess("staff.manage");
  const [members, invites] = await listTeam(access.workspaceId);
  return <><PageHeader eyebrow="Settings" title="Team" />
    <section className="split">
      <section className="panel"><div className="panel-title"><h2>{members.length} people</h2><span>Office: quotes, invoices, payments. Technician: jobs and cash.</span></div>
        <div className="data-list">{members.map((member) => <div className="row" key={member.id}><div><strong>{member.user.name || member.user.email}</strong><span>{member.user.email} · {ROLE_LABELS[member.role]}{member.sessions[0] ? ` · active ${formatDate(member.sessions[0].lastSeenAt)}` : " · signed out"}</span></div>{member.role !== "OWNER" && <MemberActions membershipId={member.id} role={member.role} />}</div>)}</div>
      </section>
      <section className="panel"><div className="panel-title"><h2>Invite someone</h2><span>The link works once, for 3 days</span></div><InviteMemberForm />
        {invites.length > 0 && <div className="data-list" style={{ marginTop: 16 }}>{invites.map((invite) => <div className="row" key={invite.id}><div><strong>{invite.email}</strong><span>{ROLE_LABELS[invite.role]} · expires {formatDate(invite.expiresAt)}</span></div><RevokeInviteButton inviteId={invite.id} /></div>)}</div>}
      </section>
    </section></>;
}
