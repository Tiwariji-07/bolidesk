"use client";
import { useState } from "react";
import { customers as initialCustomers } from "@/lib/demo-data";
import { formatINR } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export default function CustomersPage() {
  const [items, setItems] = useState(initialCustomers);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [area, setArea] = useState("");
  function addCustomer(event: React.FormEvent) { event.preventDefault(); if (!name.trim() || !phone.trim()) return; setItems([{ id: crypto.randomUUID(), name, phone, area: area || "Not set", jobs: 0, due: 0 }, ...items]); setName(""); setPhone(""); setArea(""); setShowForm(false); }
  return <><PageHeader eyebrow="People you serve" title="Customers" action={<button onClick={() => setShowForm(!showForm)}>+ New customer</button>} />
  {showForm && <section className="panel"><form className="form-grid two" onSubmit={addCustomer}><div className="field"><label htmlFor="name">Customer name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Priya Iyer" /></div><div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91 98…" /></div><div className="field"><label htmlFor="area">Area</label><input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Jayanagar" /></div><div className="form-actions"><button type="submit">Save customer</button><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button></div></form></section>}
  <section className="panel"><div className="panel-title"><h2>{items.length} customers</h2><span>Changes last for this demo session</span></div>{items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Area</th><th>Jobs</th><th>Outstanding</th></tr></thead><tbody>{items.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td className="muted">{customer.phone}</td><td>{customer.area}</td><td>{customer.jobs}</td><td><strong>{formatINR(customer.due)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="Your customer list is ready">Add the first customer to start a job.</EmptyState>}</section></>;
}
