"use client";

import { useState } from "react";

/** Shows a one-time link with a copy button and a WhatsApp share link. */
/** With a phone, "Open in WhatsApp" opens that customer's chat with the message filled in (click-to-chat, free, no API). */
export function CopyLink({ label, url, whatsappText, phone }: { label: string; url: string; whatsappText?: string; phone?: string }) {
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(whatsappText ? `${whatsappText} ${url}` : url)}`;
  return <div className="notice copy-link" role="status"><p>{label}</p><code>{url}</code><div className="form-actions">
    <button type="button" className="small" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
    <a className="button secondary small" href={share} target="_blank" rel="noreferrer">{phone ? "Open in WhatsApp" : "Share on WhatsApp"}</a>
  </div></div>;
}
