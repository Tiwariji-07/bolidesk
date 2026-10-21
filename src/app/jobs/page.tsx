import Link from "next/link";
import { JobCaptureForm } from "@/components/job-capture-form";
import { PageHeader, Status } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { can, currentAccess } from "@/server/access";
import { createProviders } from "@/server/integrations/providers";
import { getWorkspace, listCustomers, listJobs } from "@/server/queries";

export default async function JobsPage() {
  const access = await currentAccess();
  const [customers, jobs, workspace] = await Promise.all([listCustomers(access.workspaceId), listJobs(access.workspaceId), getWorkspace(access.workspaceId)]);
  return <><PageHeader eyebrow="Capture while it is fresh" title="Jobs" />
    <JobCaptureForm customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} parserName={createProviders().jobParser.name} canQuote={can(access, "quotes.draft")} defaultState={workspace.stateCode} />
    <section className="panel"><div className="panel-title"><h2>Recent jobs</h2><span>{jobs.length} saved</span></div>
      {jobs.length ? <ul className="card-list">{jobs.map((job) => <li key={job.id}><div className="card-row">
        <div><strong>{job.customer?.name ?? "No customer yet"}</strong><span>{job.note}</span></div>
        <div className="row-end"><span>{formatDate(job.createdAt)}</span>{job.quote ? <Link className="text-link-ink" href={`/quotes/${job.quote.id}`}>{job.quote.number ?? "Draft quote"} <Status value={job.quote.status} /></Link> : <span className="muted">No quote</span>}</div>
      </div></li>)}</ul> : <p className="muted">Saved job notes appear here.</p>}
    </section></>;
}
