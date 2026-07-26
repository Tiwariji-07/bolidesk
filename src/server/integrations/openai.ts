import { z } from "zod";
import type { ParsedJobNote } from "../../domain/job-note";
import type { Fetcher, JobParserProvider } from "./types";

const outputSchema = z.object({
  customerName: z.string().max(120).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTerms: z.string().min(1).max(200),
  lines: z.array(z.object({ description: z.string().min(1).max(240), quantity: z.number().positive(), unitPrice: z.number().int().nonnegative(), taxRate: z.number().min(0).max(100) })).max(50),
});

const jsonSchema = {
  name: "bolidesk_job_note",
  strict: true,
  schema: { type: "object", additionalProperties: false, properties: { customerName: { type: "string" }, dueDate: { type: "string" }, paymentTerms: { type: "string" }, lines: { type: "array", items: { type: "object", additionalProperties: false, properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "integer" }, taxRate: { type: "number" } }, required: ["description", "quantity", "unitPrice", "taxRate"] } } }, required: ["paymentTerms", "lines"] },
};

export class OpenAiStructuredJobParser implements JobParserProvider {
  readonly name = "openai";
  constructor(private readonly apiKey: string, private readonly model: string, private readonly fetcher: Fetcher = fetch) {}

  async parse(note: string): Promise<ParsedJobNote> {
    const response = await this.fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_schema", json_schema: jsonSchema }, messages: [{ role: "system", content: "Extract a service job note. Use INR paise-free whole rupees and do not invent line items." }, { role: "user", content: note }] }),
    });
    if (!response.ok) throw new Error(`OpenAI job parser failed (${response.status}).`);
    const payload: unknown = await response.json();
    const content = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(payload).choices[0].message.content;
    return outputSchema.parse(JSON.parse(content));
  }
}
