import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { isDemoMode } from "@/server/env";
import { findSession, sessionToken } from "@/server/session";

export const metadata: Metadata = { title: "BoliDesk", description: "WhatsApp-first voice-to-cash workspace" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
// Workspace pages require a database and must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await findSession(await sessionToken()).catch(() => null);
  return <html lang="en-IN"><body><a className="skip-link" href="#main-content">Skip to main content</a><AppShell demoMode={isDemoMode()} workspaceName={session?.workspaceName}>{children}</AppShell></body></html>;
}
