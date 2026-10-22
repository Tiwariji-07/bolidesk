"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth-actions";

const publicPrefixes = ["/login", "/register", "/invite", "/p/", "/payment-complete"];

/** `links` come from the server, filtered by the signed-in member's role. */
export function AppShell({ children, demoMode, workspaceName, links = [] }: { children: ReactNode; demoMode: boolean; workspaceName?: string; links?: [string, string][] }) {
  const pathname = usePathname();
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))) return <>{children}</>;
  const current = (href: string) => href === "/" ? pathname === href : pathname.startsWith(href);
  const navLinks = links.map(([href, label]) => <Link aria-current={current(href) ? "page" : undefined} key={href} href={href}>{label}</Link>);
  const signOut = <form action={logout}><button className="text-link logout" type="submit">Sign out</button></form>;
  return <div className="app-frame">
    <aside className="sidebar"><Link className="brand" href="/"><span aria-hidden="true">●</span> BoliDesk</Link>{workspaceName && <p className="workspace">{workspaceName}<br /><Link href="/switch" className="text-link">Switch shop</Link></p>}<nav aria-label="Primary navigation">{navLinks}</nav>{demoMode && <div className="side-note"><strong>Demo mode</strong><br />Payments and WhatsApp are simulated.</div>}{signOut}</aside>
    <main id="main-content" tabIndex={-1}>
      <div className="mobile-nav"><Link className="brand" href="/"><span aria-hidden="true">●</span> BoliDesk</Link><div className="form-actions"><Link href="/jobs" className="button small">New job</Link>{signOut}</div></div>
      <nav className="mobile-links" aria-label="Primary navigation">{navLinks}</nav>
      {demoMode && <div className="demo-banner" role="note">Demo mode. Payment links and WhatsApp messages are simulated; nothing is sent to customers.</div>}
      {children}
    </main>
  </div>;
}
