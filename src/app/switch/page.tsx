import { switchWorkspace } from "@/app/auth-actions";
import { PageHeader } from "@/components/ui";
import { currentAccess, ROLE_LABELS } from "@/server/access";
import { getPrisma } from "@/server/prisma";

export default async function SwitchWorkspacePage() {
  const access = await currentAccess();
  const memberships = await getPrisma().membership.findMany({ where: { userId: access.userId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, workspace: { select: { name: true } } } });
  return <><PageHeader eyebrow="Your shops" title="Switch shop" /><section className="panel"><div className="data-list">{memberships.map((membership) => <div className="row" key={membership.id}><div><strong>{membership.workspace.name}</strong><span>{ROLE_LABELS[membership.role]}</span></div>{membership.id === access.membershipId ? <span className="status good">current</span> : <form action={switchWorkspace.bind(null, membership.id)}><button className="small">Open</button></form>}</div>)}</div></section></>;
}
