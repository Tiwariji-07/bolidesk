import { AuthForm } from "@/components/auth-form";
import { register } from "@/app/auth-actions";

export default function RegisterPage() {
  return <AuthForm action={register} register />;
}
