"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth-actions";

const links = [["/", "Overview"], ["/customers", "Customers"], ["/jobs", "Jobs"], ["/quotes", "Quotes"], ["/invoices", "Invoices"], ["/follow-ups", "Follow-ups"], ["/settings", "Settings"]];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return <>{children}</>;
  const current = (href: string) => href === "/" ? pathname === href : pathname.startsWith(href);
  const navLinks = links.map(([href, label]) => <Link aria-current={current(href) ? "page" : undefined} key={href} href={href}>{label}</Link>);
  return <div className="app-frame"><aside className="sidebar"><Link className="brand" href="/"><span>●</span> BoliDesk</Link><p className="workspace">Your workspace<br /><strong>Secure multi-tenant access</strong></p><nav aria-label="Primary navigation">{navLinks}</nav><div className="side-note"><strong>Demo mode</strong><br />Payments and WhatsApp are safely simulated.</div><form action={logout}><button className="text-link logout" type="submit">Sign out</button></form></aside><main id="main-content"><div className="mobile-nav"><Link className="brand" href="/"><span>●</span> BoliDesk</Link><Link href="/jobs" className="button small">New job</Link></div><nav className="mobile-links" aria-label="Primary navigation">{navLinks}</nav><div className="demo-banner">Local demo workspace. No messages or payment requests leave this device.</div>{children}</main></div>;
}
