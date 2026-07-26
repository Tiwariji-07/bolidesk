import Link from "next/link";
import type { ReactNode } from "react";

export function Status({ value }: { value: string }) {
  const tone = value === "PAID" || value === "ACCEPTED" ? "good" : value === "OVERDUE" || value === "REJECTED" ? "bad" : value === "DRAFT" ? "muted" : "warn";
  return <span className={`status ${tone}`}>{value.toLowerCase()}</span>;
}

export function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{action}</header>;
}

export function EmptyState({ title, children, href, action }: { title: string; children: ReactNode; href?: string; action?: string }) {
  return <div className="empty"><p className="empty-mark">◎</p><h2>{title}</h2><p>{children}</p>{href && action && <Link className="button" href={href}>{action}</Link>}</div>;
}
