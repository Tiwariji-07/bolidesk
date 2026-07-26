import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "BoliDesk", description: "WhatsApp-first voice-to-cash workspace" };
// Workspace pages require a database and must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a><AppShell>{children}</AppShell></body></html>;
}
