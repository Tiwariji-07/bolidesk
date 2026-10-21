import Link from "next/link";
import { JobCaptureForm } from "@/components/job-capture-form";
import { JobControls, JobQuoteControls } from "@/components/job-controls";
import { PageHeader, Status } from "@/components/ui";
import { formatPhone } from "@/domain/phone";
import { formatDate, formatTime } from "@/lib/format";
import { can, currentAccess, ROLE_LABELS } from "@/server/access";
import { createProviders } from "@/server/integrations/providers";
import { getWorkspace, listCustomers, listJobs, listTeamMembers } from "@/server/queries";

/** datetime-local value in IST for an instant. */
const istInput = (value: Date) => new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 16);

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const access = await currentAccess();
  const office = can(access, "jobs.assign");
  const mineOnly = (await searchParams).show === "mine" || (!office && (await searchParams).show !== "all");
  const [customers, jobs, workspace, team] = await Promise.all([listCustomers(access.workspaceId), listJobs(access.workspaceId, mineOnly ? access.userId : undefined), getWorkspace(access.workspaceId), listTeamMembers(access.workspaceId)]);
  const members = team.map((member) => ({ id: member.user.id, label: `${member.user.name ?? member.user.email} (${ROLE_LABELS[member.role]})` }));
  return <><PageHeader eyebrow="Capture while it is fresh" title="Jobs" />
    <JobCaptureForm customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} parserName={createProviders().jobParser.name} canQuote={can(access, "quotes.draft")} defaultState={workspace.stateCode} />
    <section className="panel"><div className="panel-title"><h2>{mineOnly ? "My jobs" : "All jobs"}</h2><nav className="form-actions" aria-label="Job filter"><Link className="text-link-ink" aria-current={mineOnly ? "page" : undefined} href="/jobs?show=mine">Mine</Link><Link className="text-link-ink" aria-current={mineOnly ? undefined : "page"} href="/jobs?show=all">All</Link></nav></div>
      {jobs.length ? <ul className="card-list">{jobs.map((job) => <li key={job.id}><div className="job-card">
        <div><div className="form-actions"><Status value={job.status} />{job.scheduledAt && <span className="muted">Visit {formatDate(job.scheduledAt)}, {formatTime(job.scheduledAt)}</span>}</div>
          <strong>{job.customer ? <Link className="text-link-ink" href={`/customers/${job.customer.id}`}>{job.customer.name}</Link> : "No customer yet"}</strong>
          <p className="muted">{job.note}</p>
          {job.customer && <p className="muted">{job.customer.address ? `${job.customer.address} · ` : ""}<a href={`tel:${job.customer.phone}`}>{formatPhone(job.customer.phone)}</a></p>}
          <p className="muted">{job.assignee ? `With ${job.assignee.name ?? job.assignee.email}` : "Not assigned"}{job.quote ? <> · <Link className="text-link-ink" href={`/quotes/${job.quote.id}`}>{job.quote.number ?? "Draft quote"}</Link></> : ""}</p>
        </div>
        <div className="job-controls">{!job.quote && job.status !== "CANCELLED" && can(access, "quotes.draft") && <JobQuoteControls jobId={job.id} hasCustomer={Boolean(job.customer)} customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} />}<JobControls jobId={job.id} status={job.status} assigneeId={job.assignee?.id ?? null} visit={job.scheduledAt ? istInput(job.scheduledAt) : null} members={members} office={office} mine={job.assignee?.id === access.userId} /></div>
      </div></li>)}</ul> : <p className="muted">{mineOnly ? "No jobs assigned to you." : "Saved job notes appear here."}</p>}
    </section></>;
}
