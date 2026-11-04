"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LoginSchema, SignupSchema, type AuthFormState } from "./schemas";

export async function login(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica: não revela se o e-mail existe.
    return { message: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}

export async function signup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const { name, email, password } = parsed.data;
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { message: "Não foi possível criar a conta. Tente novamente." };
  }

  // Com confirmação de e-mail ativa, não há sessão até o usuário confirmar.
  if (!data.session) {
    return {
      message: "Conta criada. Verifique seu e-mail para confirmar o cadastro.",
    };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as NonNullable<AuthFormState>["errors"];
}
