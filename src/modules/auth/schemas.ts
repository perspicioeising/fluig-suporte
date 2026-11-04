import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Informe um e-mail válido." }).trim(),
  password: z.string().min(1, { error: "Informe a senha." }),
});

export const SignupSchema = z.object({
  name: z.string().trim().min(2, { error: "Informe seu nome." }),
  email: z.email({ error: "Informe um e-mail válido." }).trim(),
  password: z
    .string()
    .min(8, { error: "A senha deve ter ao menos 8 caracteres." })
    .regex(/[a-zA-Z]/, { error: "Inclua ao menos uma letra." })
    .regex(/[0-9]/, { error: "Inclua ao menos um número." }),
});

export type AuthFormState =
  | {
      errors?: { name?: string[]; email?: string[]; password?: string[] };
      message?: string;
    }
  | undefined;
