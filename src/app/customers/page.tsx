import { CustomerForm } from "@/components/customer-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

export default async function CustomersPage() {
  const workspace = forWorkspace(await currentWorkspaceId());
  const [customers, invoices] = await Promise.all([workspace.customers.list(), workspace.invoices.list()]);
  const outstanding = new Map<string, number>();
  for (const invoice of invoices.filter((invoice) => invoice.status !== "PAID")) outstanding.set(invoice.customerId, (outstanding.get(invoice.customerId) ?? 0) + invoice.total);
  return <><PageHeader eyebrow="People you serve" title="Customers" action={<CustomerForm />} /><section className="panel"><div className="panel-title"><h2>{customers.length} customers</h2><span>Saved to this workspace</span></div>{customers.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Area</th><th>Jobs</th><th>Outstanding</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td className="muted">{customer.phone}</td><td>{customer.address ?? "Not set"}</td><td>{customer._count.jobs}</td><td><strong>{formatINR(outstanding.get(customer.id) ?? 0)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="Your customer list is ready" href="/customers" action="Add a customer">Add the first customer to start a job.</EmptyState>}</section></>;
}
