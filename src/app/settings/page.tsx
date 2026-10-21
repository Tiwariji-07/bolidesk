import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui";
import { can, currentAccess } from "@/server/access";
import { isDemoMode } from "@/server/env";
import { getPrisma } from "@/server/prisma";
import { getWorkspace } from "@/server/queries";

export default async function SettingsPage() {
  const access = await currentAccess();
  const [workspace, counters] = await Promise.all([getWorkspace(access.workspaceId), getPrisma().documentCounter.count({ where: { workspaceId: access.workspaceId } })]);
  const demo = isDemoMode();
  const live = () => <span className={`status ${demo ? "muted" : "good"}`}>{demo ? "Demo" : "Live"}</span>;
  return <><PageHeader eyebrow="Make it yours" title="Settings" action={can(access, "staff.manage") ? <Link className="button secondary" href="/settings/team">Team and invites</Link> : undefined} />
    <section className="split">
      {can(access, "settings.write") ? <SettingsForm settings={workspace} prefixLocked={counters > 0} /> : <section className="panel"><p className="muted">Only the owner can change business settings.</p></section>}
      <section className="panel"><div className="panel-title"><h2>Connections</h2><span>{demo ? "Demo mode: nothing is sent" : "Live"}</span></div>
        <div className="integration"><div><h3>WhatsApp Cloud API</h3><p>Sends invoices and payment reminders to the customer&apos;s WhatsApp.</p></div>{live()}</div>
        <div className="integration"><div><h3>Razorpay</h3><p>UPI, card and net-banking payment links; payments are recorded automatically.</p></div>{live()}</div>
        <div className="integration"><div><h3>AI note reader</h3><p>Reads job notes into draft lines. Notes are sent to OpenAI when live.</p></div>{live()}</div>
      </section>
    </section></>;
}
