import { STATES, type CalculatedLine, type DocumentLine } from "@/domain/gst";
import { formatDay, formatINR } from "@/lib/format";
import { formatPhone } from "@/domain/phone";
import type { BuyerSnapshot, SellerSnapshot } from "@/server/billing";

type Party = { name: string; address?: string | null; stateCode?: string | null; gstin?: string | null; phone?: string | null };
type Heads = { subtotal: number; cgst: number; sgst: number; igst: number; tax: number; total: number };

const stateLabel = (code?: string | null) => code ? `${STATES[code] ?? "Unknown"} (${code})` : null;

/** The paper invoice/quote: tax heads per line, seller and buyer as frozen at issue. Print-friendly. */
export function DocumentView({ title, number, issued, due, seller, buyer, placeOfSupply, lines, heads, terms, footer, legacy }: {
  title: string; number: string | null; issued: Date | null; due: Date | null;
  seller: Party & { tradeName?: string; upiId?: string | null }; buyer: Party; placeOfSupply: string | null;
  lines: (DocumentLine | CalculatedLine)[]; heads: Heads; terms?: string | null; footer?: React.ReactNode; legacy?: boolean;
}) {
  const showIgst = heads.igst > 0;
  const showCgst = heads.cgst > 0 || heads.sgst > 0;
  const showCodes = lines.some((line) => line.code);
  return <article className="invoice-paper" aria-label={`${title} ${number ?? "draft"}`}>
    <div className="invoice-top">
      <div>
        <p className="eyebrow">{seller.tradeName ?? seller.name}</p>
        <h2>{title}</h2>
        <p className="muted">{seller.name}{seller.address ? <><br />{seller.address}</> : null}{seller.stateCode ? <><br />State: {stateLabel(seller.stateCode)}</> : null}{seller.gstin ? <><br />GSTIN: {seller.gstin}</> : null}</p>
      </div>
      <div className="invoice-meta"><strong>{number ?? "Draft"}</strong>{issued && <><br />Date {formatDay(issued)}</>}<br />Due {due ? formatDay(due) : "on receipt"}{placeOfSupply && <><br />Place of supply: {stateLabel(placeOfSupply)}</>}</div>
    </div>
    {legacy && <p className="notice">Issued before BoliDesk kept invoice snapshots; seller and buyer details are reconstructed.</p>}
    <div className="split" style={{ margin: "18px 0" }}>
      <div><p className="eyebrow">Bill to</p><strong>{buyer.name}</strong>{buyer.address && <><br /><span className="muted">{buyer.address}</span></>}{buyer.stateCode && <><br /><span className="muted">State: {stateLabel(buyer.stateCode)}</span></>}{buyer.gstin && <><br /><span className="muted">GSTIN: {buyer.gstin}</span></>}{buyer.phone && <><br /><span className="muted">{formatPhone(buyer.phone)}</span></>}</div>
      {terms && <div><p className="eyebrow">Payment terms</p><strong>{terms}</strong></div>}
    </div>
    <div className="table-wrap"><table className="data-table doc-table">
      <thead><tr><th>Item</th>{showCodes && <th>SAC/HSN</th>}<th>Qty</th><th>Rate</th><th>Taxable</th>{showCgst && <th>GST</th>}{showIgst && <th>IGST</th>}</tr></thead>
      <tbody>{lines.map((line, index) => {
        const calculated = "taxable" in line ? line : null;
        return <tr key={index}><td>{line.description}</td>{showCodes && <td>{line.code ?? ""}</td>}<td>{line.quantity}</td><td>{formatINR(line.unitPrice)}</td><td>{formatINR(calculated?.taxable ?? Math.round(line.unitPrice * line.quantity))}</td>{showCgst && <td>{line.taxRate}%{calculated ? ` · ${formatINR(calculated.cgst + calculated.sgst)}` : ""}</td>}{showIgst && <td>{line.taxRate}%{calculated ? ` · ${formatINR(calculated.igst)}` : ""}</td>}</tr>;
      })}</tbody>
    </table></div>
    <dl className="doc-totals">
      <div><dt>Taxable value</dt><dd>{formatINR(heads.subtotal)}</dd></div>
      {showCgst && <><div><dt>CGST</dt><dd>{formatINR(heads.cgst)}</dd></div><div><dt>SGST</dt><dd>{formatINR(heads.sgst)}</dd></div></>}
      {showIgst && <div><dt>IGST</dt><dd>{formatINR(heads.igst)}</dd></div>}
      {!showCgst && !showIgst && heads.tax > 0 && <div><dt>GST</dt><dd>{formatINR(heads.tax)}</dd></div>}
      <div className="grand"><dt>Total</dt><dd>{formatINR(heads.total)}</dd></div>
    </dl>
    {seller.upiId && <p className="muted">Pay by UPI to <strong>{seller.upiId}</strong> and mention {number ?? "this document"}.</p>}
    {footer}
  </article>;
}

export function sellerFromSnapshot(snapshot: SellerSnapshot | null, fallback: { name: string; brandName: string }) {
  return snapshot ? { name: snapshot.legalName ?? fallback.name, tradeName: snapshot.tradeName, address: snapshot.address, stateCode: snapshot.stateCode, gstin: snapshot.gstin, upiId: snapshot.upiId } : { name: fallback.name, tradeName: fallback.brandName };
}

export function buyerFromSnapshot(snapshot: BuyerSnapshot | null, fallback: Party) {
  return snapshot ? { name: snapshot.name, address: snapshot.address, stateCode: snapshot.stateCode, gstin: snapshot.gstin, phone: snapshot.phone } : fallback;
}
