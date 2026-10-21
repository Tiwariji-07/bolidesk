"use client";

import { useState } from "react";

/** Shows a one-time link with a copy button and a WhatsApp share link. */
export function CopyLink({ label, url, whatsappText }: { label: string; url: string; whatsappText?: string }) {
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent(whatsappText ? `${whatsappText} ${url}` : url)}`;
  return <div className="notice copy-link" role="status"><p>{label}</p><code>{url}</code><div className="form-actions">
    <button type="button" className="small" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
    <a className="button secondary small" href={share} target="_blank" rel="noreferrer">Share on WhatsApp</a>
  </div></div>;
}
