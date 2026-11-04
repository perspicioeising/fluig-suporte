import type { Metadata } from "next";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Criar conta</h1>
      <AuthForm mode="signup" />
    </>
  );
}
