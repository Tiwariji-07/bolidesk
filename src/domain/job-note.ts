import type { QuoteLine } from "./quote";

export type ParsedJobNote = {
  customerName?: string;
  dueDate?: string;
  paymentTerms: string;
  lines: QuoteLine[];
};

export interface JobNoteParser {
  parse(note: string): ParsedJobNote;
}

/** Local fallback parser. An AI-backed provider can satisfy JobNoteParser later. */
export function parseJobNote(note: string): ParsedJobNote {
  const customerName = note.match(/^\s*([^,]+),/)?.[1]?.trim();
  const service = note.match(/(\d+)\s+(.+?)s?\s+at\s+[₹Rs.]?\s*(\d+)/i);
  const gst = Number(note.match(/GST\s*(\d+)%/i)?.[1] ?? 18);
  const due = note.match(/due\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  const month = due ? new Date(`${due[2]} 1, ${due[3]}`).getMonth() + 1 : undefined;
  const dueDate = due && month ? `${due[3]}-${String(month).padStart(2, "0")}-${due[1].padStart(2, "0")}` : undefined;

  return {
    customerName,
    dueDate,
    paymentTerms: dueDate ? `Due ${dueDate}` : "Due on receipt",
    lines: service
      ? [{ description: service[2].replace(/s$/i, "").trim(), quantity: Number(service[1]), unitPrice: Number(service[3]), taxRate: gst }]
      : [],
  };
}

export const localJobNoteParser: JobNoteParser = { parse: parseJobNote };
