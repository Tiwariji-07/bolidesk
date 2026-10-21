import { z } from "zod";
import { isIsoDate } from "@/domain/business-time";
import type { ParsedJobNote } from "@/domain/job-note";
import { parseRupees } from "@/domain/money";
import type { Fetcher, JobParserProvider } from "./types";

/** Model output is untrusted: prices come back as rupee text and are converted exactly; anything unreadable is dropped. */
const outputSchema = z.object({
  customerName: z.string().max(120).nullable(),
  dueDate: z.string().nullable(),
  paymentTerms: z.string().max(200).nullable(),
  lines: z.array(z.object({ description: z.string().min(1).max(240), quantity: z.number().positive().max(100000), unitPriceRupees: z.string().max(20), taxRate: z.number().min(0).max(40).nullable() })).max(50),
});

const nullable = (type: string) => ({ type: [type, "null"] });
const jsonSchema = {
  name: "bolidesk_job_note",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["customerName", "dueDate", "paymentTerms", "lines"],
    properties: {
      customerName: nullable("string"), dueDate: nullable("string"), paymentTerms: nullable("string"),
      lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["description", "quantity", "unitPriceRupees", "taxRate"], properties: { description: { type: "string" }, quantity: { type: "number" }, unitPriceRupees: { type: "string" }, taxRate: nullable("number") } } },
    },
  },
};

const SYSTEM = "Extract line items from an Indian service job note. unitPriceRupees is the price per unit in rupees exactly as written, digits only with an optional decimal point (\"1,250\" -> \"1250\", \"Rs 650.50\" -> \"650.50\"). taxRate is the GST percent only if the note states it, otherwise null. dueDate is YYYY-MM-DD only if a date is stated, otherwise null. Never invent items, prices or rates.";

export class OpenAiStructuredJobParser implements JobParserProvider {
  readonly name = "openai";
  constructor(private readonly apiKey: string, private readonly model: string, private readonly fetcher: Fetcher = fetch) {}

  async parse(note: string): Promise<ParsedJobNote> {
    const response = await this.fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_schema", json_schema: jsonSchema }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: note }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`OpenAI job parser failed (${response.status}).`);
    const payload: unknown = await response.json();
    const content = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(payload).choices[0].message.content;
    const output = outputSchema.parse(JSON.parse(content));
    const dueDate = output.dueDate && isIsoDate(output.dueDate) ? output.dueDate : undefined;
    return {
      customerName: output.customerName ?? undefined,
      dueDate,
      paymentTerms: output.paymentTerms ?? (dueDate ? `Due ${dueDate}` : "Due on receipt"),
      lines: output.lines.flatMap((line) => {
        const unitPrice = parseRupees(line.unitPriceRupees);
        return unitPrice === null ? [] : [{ description: line.description, quantity: line.quantity, unitPrice, taxRate: line.taxRate }];
      }),
    };
  }
}
