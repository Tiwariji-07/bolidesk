"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/server/errors";
import { CopyLink } from "./copy-link";

/**
 * Runs a bound server action. `next` may contain {id} or {url}, filled from the action's result.
 * A returned { url } without `next` is shown as a copyable link.
 */
export function ActionButton({ action, label, pendingLabel, confirmText, next, variant, linkLabel, whatsappText }: {
  action: () => Promise<Result<unknown>>; label: string; pendingLabel?: string; confirmText?: string; next?: string;
  variant?: "secondary" | "small" | "secondary small"; linkLabel?: string; whatsappText?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(""); const [link, setLink] = useState("");
  const [pending, startTransition] = useTransition();
  function run() {
    if (confirmText && !confirm(confirmText)) return;
    setError(""); setLink("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      const data = (result.data ?? {}) as { id?: string; url?: string };
      if (next) return router.push(next.replace("{id}", data.id ?? "").replace("{url}", data.url ?? ""));
      if (data.url) setLink(data.url);
      router.refresh();
    });
  }
  return <div className="action-button">
    <button type="button" className={variant} onClick={run} disabled={pending}>{pending ? pendingLabel ?? "Working…" : label}</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {link && <CopyLink label={linkLabel ?? "Link ready"} url={link} whatsappText={whatsappText} />}
  </div>;
}
