"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateUser, loginThrottle, normalizeEmail, passwordProblem, registerWorkspaceOwner } from "@/server/auth";
import { readEnvironment } from "@/server/env";
import { userMessage } from "@/server/errors";
import { getPrisma } from "@/server/prisma";
import { endSession, startSession } from "@/server/session";
import { acceptInvite } from "@/server/staff";

const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const registerSchema = z.object({ email: z.email(), name: z.string().trim().max(80).optional(), password: z.string(), workspaceName: z.string().trim().min(2).max(80) });

export type AuthFormState = { error?: string };

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) return { error: "Enter a valid email and password." };
  const key = normalizeEmail(input.data.email);
  if (loginThrottle.blocked(key)) return { error: "Too many attempts. Wait 15 minutes and try again." };
  const user = await authenticateUser(getPrisma(), input.data.email, input.data.password);
  if (!user) {
    loginThrottle.fail(key);
    return { error: "Invalid email or password." };
  }
  const membership = await getPrisma().membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!membership) return { error: "This account is not on any team. Ask your shop owner for an invite." };
  loginThrottle.clear(key);
  await startSession(membership.id);
  redirect("/");
}

export async function register(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!readEnvironment().ALLOW_REGISTRATION) return { error: "New workspaces are closed on this server. Ask the owner for an invite." };
  const input = registerSchema.safeParse({ email: formData.get("email"), name: formData.get("name") || undefined, password: formData.get("password"), workspaceName: formData.get("workspaceName") });
  if (!input.success) return { error: "Use a valid email and a business name of at least 2 characters." };
  const problem = passwordProblem(input.data.password);
  if (problem) return { error: problem };
  try {
    const account = await registerWorkspaceOwner(getPrisma(), input.data);
    await startSession(account.membershipId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "Could not create the workspace with those details. If you already have an account, sign in." };
    return { error: userMessage(error) };
  }
  redirect("/");
}

export async function acceptInviteAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const isNew = formData.get("newAccount") === "true";
  if (isNew) {
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
    if (password !== String(formData.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  }
  try {
    const { membershipId } = await acceptInvite({ token, password, name: String(formData.get("name") ?? "") });
    await startSession(membershipId);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
