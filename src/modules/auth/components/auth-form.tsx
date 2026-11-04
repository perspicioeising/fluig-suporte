"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "../actions";

type Mode = "login" | "signup";

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted";

export function AuthForm({ mode }: { mode: Mode }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState(
    isSignup ? signup : login,
    undefined,
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      {isSignup && (
        <Field
          id="name"
          label="Nome"
          autoComplete="name"
          errors={state?.errors?.name}
        />
      )}
      <Field
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        errors={state?.errors?.email}
      />
      <Field
        id="password"
        label="Senha"
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        errors={state?.errors?.password}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-muted">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Aguarde..." : isSignup ? "Criar conta" : "Entrar"}
      </button>

      <p className="text-center text-sm text-muted">
        {isSignup ? "Já tem conta? " : "Ainda não tem conta? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="text-accent hover:underline"
        >
          {isSignup ? "Entrar" : "Criar conta"}
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  errors,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  errors?: string[];
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className={inputClass}
      />
      {errors && (
        <p id={errorId} className="text-xs text-danger">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
