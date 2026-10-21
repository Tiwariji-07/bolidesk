"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/auth-actions";

const initialState: AuthFormState = {};

export function AuthForm({ action, register = false, registrationOpen = false }: { action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>; register?: boolean; registrationOpen?: boolean }) {
  const [state, submit, pending] = useActionState(action, initialState);
  return <main id="main-content" className="auth-page"><section className="auth-card"><Link className="brand" href="/"><span aria-hidden="true">●</span> BoliDesk</Link><p className="eyebrow">{register ? "Create your workspace" : "Welcome back"}</p><h1>{register ? "Start using BoliDesk" : "Sign in to BoliDesk"}</h1><form action={submit} className="auth-form">
    {register && <label>Business name<input name="workspaceName" autoComplete="organization" required minLength={2} /></label>}
    {register && <label>Your name<input name="name" autoComplete="name" /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : undefined} /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Please wait…" : register ? "Create workspace" : "Sign in"}</button>
  </form>{register ? <p className="muted">Already have an account? <Link href="/login">Sign in</Link></p> : registrationOpen ? <p className="muted">New to BoliDesk? <Link href="/register">Create a workspace</Link></p> : <p className="muted">Staff join with an invite link from the shop owner.</p>}</section></main>;
}
