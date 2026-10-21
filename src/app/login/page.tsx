import { AuthForm } from "@/components/auth-form";
import { login } from "@/app/auth-actions";
import { readEnvironment } from "@/server/env";

export default function LoginPage() {
  return <AuthForm action={login} registrationOpen={readEnvironment().ALLOW_REGISTRATION} />;
}
