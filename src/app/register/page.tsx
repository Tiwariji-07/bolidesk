import { notFound } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { register } from "@/app/auth-actions";
import { readEnvironment } from "@/server/env";

export default function RegisterPage() {
  if (!readEnvironment().ALLOW_REGISTRATION) notFound();
  return <AuthForm action={register} register />;
}
