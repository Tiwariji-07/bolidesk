import { Prisma } from "@prisma/client";
import { AccessError } from "./access";

/** An error whose message is written for shop staff and safe to show. */
export class UserError extends Error {}

/** Another member changed the record first; the user should reload and retry. */
export class ConflictError extends UserError {
  constructor(message = "Someone else changed this just now. Reload and try again.") {
    super(message);
  }
}

export function userMessage(error: unknown, fallback = "Could not save your changes. Try again."): string {
  if (error instanceof UserError || error instanceof AccessError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "That already exists in this workspace.";
  console.error(error);
  return fallback;
}

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Runs a server action body and converts any failure into a staff-safe message. */
export async function attempt<T>(body: () => Promise<T>, fallback?: string): Promise<Result<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (isNavigationSignal(error)) throw error;
    return { ok: false, error: userMessage(error, fallback) };
  }
}

function isNavigationSignal(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"));
}
