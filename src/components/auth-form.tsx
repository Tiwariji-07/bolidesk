"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/auth-actions";

const initialState: AuthFormState = {};

export function AuthForm({ action, register = false }: { action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>; register?: boolean }) {
  const [state, submit, pending] = useActionState(action, initialState);
  return <main className="auth-page"><section className="auth-card"><Link className="brand" href="/"><span>●</span> BoliDesk</Link><p className="eyebrow">{register ? "Create your workspace" : "Welcome back"}</p><h1>{register ? "Start using BoliDesk" : "Sign in to BoliDesk"}</h1><form action={submit} className="auth-form">
    {register && <label>Workspace name<input name="workspaceName" autoComplete="organization" required minLength={2} /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : undefined} /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Please wait…" : register ? "Create workspace" : "Sign in"}</button>
  </form><p className="muted">{register ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>New to BoliDesk? <Link href="/register">Create a workspace</Link></>}</p></section></main>;
}
