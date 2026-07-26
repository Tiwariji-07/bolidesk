import { cookies } from "next/headers";
import { createSessionToken, readSessionToken } from "./auth";

export const SESSION_COOKIE_NAME = "bolidesk_session";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  return secret;
}

export async function sessionUserId() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return readSessionToken(token, sessionSecret())?.userId ?? null;
}

export async function startSession(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const token = createSessionToken({ userId, issuedAt: now, expiresAt: now + SESSION_LIFETIME_SECONDS }, sessionSecret());
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
