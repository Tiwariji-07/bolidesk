"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueInvoiceAction, moveQuoteAction, saveInvoiceDraftAction, saveQuoteDraftAction } from "@/app/actions";
import { calculateDocument, STATES, taxModeFor, type DocumentLine, type GstScheme } from "@/domain/gst";
import { paiseToRupeeInput, parseRupees } from "@/domain/money";
import { formatINR } from "@/lib/format";

type Row = { key: number; description: string; quantity: string; unitPrice: string; taxRate: string; code: string };
type Seller = { stateCode: string | null; gstScheme: GstScheme | null; rates: number[] };

let nextKey = 1;
const toRow = (line: DocumentLine): Row => ({ key: nextKey++, description: line.description, quantity: String(line.quantity), unitPrice: line.unitPrice ? paiseToRupeeInput(line.unitPrice) : "", taxRate: String(line.taxRate), code: line.code ?? "" });

/** Draft quote/invoice lines. Totals here are a preview; the server recalculates from the same rules on save and issue. */
/** `finalize` (issue invoice / mark quote sent) acts on the saved version, so it is disabled while there are unsaved edits. */
export function LineEditor({ kind, id, version, lines, dueDate, placeOfSupply, paymentTerms, seller, defaultRate, defaultCode, finalize }: { kind: "quote" | "invoice"; id: string; version: number; lines: DocumentLine[]; dueDate: string | null; placeOfSupply: string | null; paymentTerms?: string | null; seller: Seller; defaultRate: number; defaultCode: string | null; finalize?: { label: string; confirmText: string } }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => lines.map(toRow));
  const [due, setDue] = useState(dueDate ?? "");
  const [pos, setPos] = useState(placeOfSupply ?? seller.stateCode ?? "");
  const [terms, setTerms] = useState(paymentTerms ?? "");
  const [error, setError] = useState(""); const [saved, setSaved] = useState(false); const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const mode = taxModeFor(seller.gstScheme, seller.stateCode, pos || seller.stateCode);

  const preview = useMemo(() => {
    const parsed = rows.map((row) => ({ description: row.description, quantity: Number(row.quantity) || 0, unitPrice: parseRupees(row.unitPrice) ?? 0, taxRate: Number(row.taxRate) || 0 }));
    return calculateDocument(parsed, mode);
  }, [rows, mode]);

  const touch = () => { setSaved(false); setDirty(true); };
  const update = (key: number, field: keyof Omit<Row, "key">, value: string) => { touch(); setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row)); };
  const add = () => { touch(); setRows((current) => [...current, { key: nextKey++, description: "", quantity: "1", unitPrice: "", taxRate: String(defaultRate), code: defaultCode ?? "" }]); };
  const remove = (key: number) => { touch(); setRows((current) => current.length > 1 ? current.filter((row) => row.key !== key) : current); };

  function save() {
    setError(""); setSaved(false);
    startTransition(async () => {
      const input = { id, version, lines: rows.map(({ description, quantity, unitPrice, taxRate, code }) => ({ description, quantity, unitPrice, taxRate, code })), dueDate: due || undefined, placeOfSupply: pos || undefined, paymentTerms: terms || undefined };
      const result = kind === "quote" ? await saveQuoteDraftAction(input) : await saveInvoiceDraftAction(input);
      if (!result.ok) return setError(result.error);
      setSaved(true); setDirty(false);
      router.refresh();
    });
  }

  function finish() {
    if (!finalize || dirty || !confirm(finalize.confirmText)) return;
    setError("");
    startTransition(async () => {
      const result = kind === "invoice" ? await issueInvoiceAction(id, version) : await moveQuoteAction(id, "SENT", version);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return <section className="panel line-editor" aria-labelledby={`${id}-lines`}>
    <div className="panel-title"><h2 id={`${id}-lines`}>Lines</h2><span>{mode === "NONE" ? "Bill of supply, no GST" : mode === "INTER" ? "Other state: IGST" : "Same state: CGST + SGST"}</span></div>
    {rows.map((row, index) => <fieldset className="line-row" key={row.key}>
      <legend className="sr-only">Line {index + 1}</legend>
      <div className="field grow"><label htmlFor={`d-${row.key}`}>Work or part</label><input id={`d-${row.key}`} value={row.description} onChange={(event) => update(row.key, "description", event.target.value)} maxLength={240} placeholder="e.g. AC service" /></div>
      <div className="field"><label htmlFor={`q-${row.key}`}>Qty</label><input id={`q-${row.key}`} inputMode="decimal" value={row.quantity} onChange={(event) => update(row.key, "quantity", event.target.value)} /></div>
      <div className="field"><label htmlFor={`p-${row.key}`}>Rate (₹)</label><input id={`p-${row.key}`} inputMode="decimal" value={row.unitPrice} onChange={(event) => update(row.key, "unitPrice", event.target.value)} placeholder="650" aria-invalid={row.unitPrice !== "" && parseRupees(row.unitPrice) === null} /></div>
      {mode !== "NONE" && <div className="field"><label htmlFor={`t-${row.key}`}>GST %</label><select id={`t-${row.key}`} value={row.taxRate} onChange={(event) => update(row.key, "taxRate", event.target.value)}>{(seller.rates.includes(Number(row.taxRate)) ? seller.rates : [...seller.rates, Number(row.taxRate)]).map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></div>}
      {mode !== "NONE" && <div className="field"><label htmlFor={`c-${row.key}`}>SAC/HSN</label><input id={`c-${row.key}`} inputMode="numeric" value={row.code} onChange={(event) => update(row.key, "code", event.target.value.replace(/\D/g, ""))} maxLength={8} placeholder="998719" /></div>}
      <div className="line-amount"><span className="muted">Amount</span><strong>{formatINR(preview.lines[index]?.taxable ?? 0)}</strong></div>
      <button type="button" className="secondary small" onClick={() => remove(row.key)} disabled={rows.length === 1} aria-label={`Remove line ${index + 1}`}>Remove</button>
    </fieldset>)}
    <div className="form-actions"><button type="button" className="secondary small" onClick={add} disabled={rows.length >= 50}>+ Add line</button></div>
    <div className="form-grid two" style={{ marginTop: 14 }}>
      <div className="field"><label htmlFor={`${id}-due`}>Due date</label><input id={`${id}-due`} type="date" value={due} onChange={(event) => { touch(); setDue(event.target.value); }} /></div>
      {seller.gstScheme === "REGULAR" && <div className="field"><label htmlFor={`${id}-pos`}>Place of supply</label><select id={`${id}-pos`} value={pos} onChange={(event) => { touch(); setPos(event.target.value); }}>{Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}</select></div>}
      {kind === "invoice" && <div className="field"><label htmlFor={`${id}-terms`}>Payment terms</label><input id={`${id}-terms`} value={terms} maxLength={200} onChange={(event) => { touch(); setTerms(event.target.value); }} placeholder="Due on completion" /></div>}
    </div>
    <dl className="doc-totals">
      <div><dt>Taxable value</dt><dd>{formatINR(preview.subtotal)}</dd></div>
      {mode === "INTRA" && <><div><dt>CGST</dt><dd>{formatINR(preview.cgst)}</dd></div><div><dt>SGST</dt><dd>{formatINR(preview.sgst)}</dd></div></>}
      {mode === "INTER" && <div><dt>IGST</dt><dd>{formatINR(preview.igst)}</dd></div>}
      <div className="grand"><dt>Total</dt><dd>{formatINR(preview.total)}</dd></div>
    </dl>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    {saved && <p className="notice" role="status">Draft saved.</p>}
    <div className="form-actions"><button type="button" className={finalize ? "secondary" : undefined} onClick={save} disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
      {finalize && <button type="button" onClick={finish} disabled={pending || dirty} aria-describedby={dirty ? `${id}-unsaved` : undefined}>{finalize.label}</button>}
      {finalize && dirty && <span id={`${id}-unsaved`} className="muted">Save your changes first.</span>}</div>
  </section>;
}
