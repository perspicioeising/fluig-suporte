import type { Metadata } from "next";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Entrar</h1>
      <AuthForm mode="login" />
    </>
  );
}
