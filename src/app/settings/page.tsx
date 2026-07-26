import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui";
import { currentWorkspaceId } from "@/server/current-workspace";
import { forWorkspace } from "@/server/persistence";

export default async function SettingsPage() {
  const settings = await forWorkspace(await currentWorkspaceId()).workspace.get();
  if (!settings) throw new Error("Workspace settings are unavailable.");
  return <><PageHeader eyebrow="Make it yours" title="Settings" /><section className="split"><SettingsForm brandName={settings.brandName} invoicePrefix={settings.invoicePrefix} gstin={settings.gstin} /><section className="panel"><div className="panel-title"><h2>Connections</h2><span>Safe to explore</span></div><div className="integration"><div><h3>WhatsApp Cloud API</h3><p>Send quotes, invoices and payment reminders from the customer’s chat.</p></div><span className="status muted">Coming soon</span></div><div className="integration"><div><h3>Razorpay</h3><p>Create real UPI, card and bank-transfer payment links.</p></div><span className="status muted">Coming soon</span></div><div className="integration"><div><h3>AI job parser</h3><p>Turn actual voice-note transcriptions into structured job drafts.</p></div><span className="status muted">Coming soon</span></div></section></section></>;
}
