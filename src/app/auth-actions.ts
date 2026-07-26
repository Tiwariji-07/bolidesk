"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateUser, registerWorkspaceOwner } from "@/server/auth";
import { getPrisma } from "@/server/prisma";
import { endSession, startSession } from "@/server/session";

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });
const registerSchema = z.object({ email: z.email(), password: z.string().min(12).max(128), workspaceName: z.string().trim().min(2).max(80) });

export type AuthFormState = { error?: string };

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) return { error: "Enter a valid email and password." };
  const user = await authenticateUser(getPrisma(), input.data.email, input.data.password);
  if (!user) return { error: "Invalid email or password." };
  const membership = await getPrisma().membership.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!membership) return { error: "This account does not have a workspace." };
  await startSession(user.id);
  redirect("/");
}

export async function register(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = registerSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), workspaceName: formData.get("workspaceName") });
  if (!input.success) return { error: "Use a valid email, workspace name, and a password of at least 12 characters." };
  try {
    const account = await registerWorkspaceOwner(getPrisma(), input.data);
    await startSession(account.userId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "An account already exists for that email." };
    throw error;
  }
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
