import Link from "next/link";
import type { ReactNode } from "react";

const LABELS: Record<string, string> = { PART_PAID: "part paid", CREDITED: "credited", INVOICED: "invoiced", SENT: "sent", DRAFT: "draft", PAID: "paid", OVERDUE: "overdue", ACCEPTED: "accepted", REJECTED: "declined", OPEN: "open", SNOOZED: "snoozed", DONE: "done", ACTIVE: "active", PENDING: "pending", CANCELLED: "cancelled", EXPIRED: "expired" };

export function Status({ value }: { value: string }) {
  const tone = ["PAID", "ACCEPTED", "INVOICED", "DONE"].includes(value) ? "good" : ["OVERDUE", "REJECTED"].includes(value) ? "bad" : ["DRAFT", "CREDITED", "CANCELLED", "EXPIRED", "SNOOZED"].includes(value) ? "muted" : "warn";
  return <span className={`status ${tone}`}>{LABELS[value] ?? value.toLowerCase()}</span>;
}

export function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{action}</header>;
}

export function EmptyState({ title, children, href, action }: { title: string; children: ReactNode; href?: string; action?: string }) {
  return <div className="empty"><p className="empty-mark" aria-hidden="true">◎</p><h2>{title}</h2><p>{children}</p>{href && action && <Link className="button" href={href}>{action}</Link>}</div>;
}
