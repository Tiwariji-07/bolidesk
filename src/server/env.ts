import { z } from "zod";

const boolean = z.enum(["true", "false"]).optional().transform((value) => value !== "false");
const optional = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().url().optional());
const optionalAiProvider = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.enum(["openai"]).optional());

const environmentSchema = z.object({
  DEMO_MODE: boolean,
  APP_URL: optionalUrl,
  AI_PROVIDER: optionalAiProvider,
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-4.1-mini"),
  WHATSAPP_ACCESS_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_API_VERSION: z.string().trim().min(1).default("v22.0"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optional,
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
});

export type AppEnvironment = z.infer<typeof environmentSchema>;
export type EnvironmentIssue = { variable: string; message: string };

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  return environmentSchema.parse(source);
}

/** Reports production credentials without ever printing their values. */
export function validateEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentIssue[] {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) return parsed.error.issues.map((issue) => ({ variable: issue.path.join("."), message: issue.message }));
  if (parsed.data.DEMO_MODE) return [];
  const issues: EnvironmentIssue[] = [];
  const required: Array<keyof AppEnvironment> = ["APP_URL", "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
  for (const variable of required) if (!parsed.data[variable]) issues.push({ variable, message: "Required when DEMO_MODE=false." });
  if (parsed.data.AI_PROVIDER !== "openai") issues.push({ variable: "AI_PROVIDER", message: "Set to openai when DEMO_MODE=false." });
  return issues;
}

export function publicAppUrl(env = readEnvironment()): string {
  return (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
