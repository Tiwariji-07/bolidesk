import { z } from "zod";
import type { DeliveryResult, Fetcher, MessagingProvider, WhatsAppTemplate } from "./types";

export class WhatsAppCloudProvider implements MessagingProvider {
  readonly name = "whatsapp-cloud";
  constructor(private readonly accessToken: string, private readonly phoneNumberId: string, private readonly apiVersion: string, private readonly fetcher: Fetcher = fetch) {}

  sendText(input: { to: string; body: string }): Promise<DeliveryResult> {
    return this.send({ messaging_product: "whatsapp", to: input.to, type: "text", text: { body: input.body } });
  }

  sendTemplate(input: { to: string; template: WhatsAppTemplate }): Promise<DeliveryResult> {
    return this.send({ messaging_product: "whatsapp", to: input.to, type: "template", template: { name: input.template.name, language: { code: input.template.languageCode }, ...(input.template.components ? { components: input.template.components } : {}) } });
  }

  private async send(payload: unknown): Promise<DeliveryResult> {
    const response = await this.fetcher(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`WhatsApp Cloud API failed (${response.status}).`);
    const providerMessageId = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) }).parse(data).messages[0].id;
    return { providerMessageId, payload };
  }
}
