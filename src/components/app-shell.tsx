"use client";
import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

const links = [["/", "Overview"], ["/customers", "Customers"], ["/jobs", "Jobs"], ["/quotes", "Quotes"], ["/invoices", "Invoices"], ["/follow-ups", "Follow-ups"], ["/settings", "Settings"]];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = (href: string) => href === "/" ? pathname === href : pathname.startsWith(href);
  const navLinks = links.map(([href, label]) => <Link aria-current={current(href) ? "page" : undefined} key={href} href={href}>{label}</Link>);
  return <div className="app-frame"><aside className="sidebar"><Link className="brand" href="/"><span>●</span> BoliDesk</Link><p className="workspace">Demo workspace<br /><strong>CoolCare Services</strong></p><nav aria-label="Primary navigation">{navLinks}</nav><div className="side-note"><strong>Demo mode</strong><br />Payments and WhatsApp are safely simulated.</div></aside><main id="main-content"><div className="mobile-nav"><Link className="brand" href="/"><span>●</span> BoliDesk</Link><Link href="/jobs" className="button small">New job</Link></div><nav className="mobile-links" aria-label="Primary navigation">{navLinks}</nav><div className="demo-banner">Local demo workspace. No messages or payment requests leave this device.</div>{children}</main></div>;
}
