"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AuthFormState } from "@/app/auth-actions";

export function InviteForm({ token, email, hasAccount }: { token: string; email: string; hasAccount: boolean }) {
  const [state, submit, pending] = useActionState(acceptInviteAction, {} as AuthFormState);
  return <form action={submit} className="auth-form">
    <input type="hidden" name="token" value={token} /><input type="hidden" name="newAccount" value={String(!hasAccount)} />
    <label>Email<input value={email} readOnly autoComplete="username" /></label>
    {!hasAccount && <label>Your name<input name="name" autoComplete="name" /></label>}
    <label>{hasAccount ? "Your BoliDesk password" : "Choose a password (12+ characters)"}<input name="password" type="password" required autoComplete={hasAccount ? "current-password" : "new-password"} minLength={hasAccount ? undefined : 12} /></label>
    {!hasAccount && <label>Repeat password<input name="confirm" type="password" required autoComplete="new-password" minLength={12} /></label>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Joining…" : "Join the team"}</button>
  </form>;
}
