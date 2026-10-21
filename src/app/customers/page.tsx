import Link from "next/link";
import { CustomerForm } from "@/components/customer-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatPhone } from "@/domain/phone";
import { formatINR } from "@/lib/format";
import { currentAccess } from "@/server/access";
import { getWorkspace, listCustomers } from "@/server/queries";

export default async function CustomersPage() {
  const access = await currentAccess();
  const [customers, workspace] = await Promise.all([listCustomers(access.workspaceId), getWorkspace(access.workspaceId)]);
  return <><PageHeader eyebrow="People you serve" title="Customers" action={<CustomerForm defaultState={workspace.stateCode} />} />
    <section className="panel"><div className="panel-title"><h2>{customers.length} customers</h2><span>Open one to quote or invoice</span></div>
      {customers.length ? <ul className="card-list">{customers.map((customer) => <li key={customer.id}><Link className="card-row" href={`/customers/${customer.id}`}>
        <div><strong>{customer.name}</strong><span>{formatPhone(customer.phone)}{customer.address ? ` · ${customer.address}` : ""}</span></div>
        <div className="row-end"><strong>{formatINR(customer.duePaise)}</strong><span>{customer._count.jobs} jobs</span></div>
      </Link></li>)}</ul> : <EmptyState title="Your customer list is ready">Add the first customer to start a job.</EmptyState>}
    </section></>;
}
