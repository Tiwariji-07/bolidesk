import { JobCaptureForm } from "@/components/job-capture-form";
import { PageHeader } from "@/components/ui";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

export default async function JobsPage() {
  const customers = await forWorkspace(await currentWorkspaceId()).customers.list();
  return <><PageHeader eyebrow="Capture while it is fresh" title="New job" /><JobCaptureForm customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))} /></>;
}
