"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  clearCredentials,
  createEnvironment,
  deleteEnvironment,
  saveCredentials,
  updateEnvironment,
} from "../actions";
import {
  AUTH_LABELS,
  AUTH_TYPES,
  type AuthType,
  type EnvironmentSummary,
} from "../constants";
import {
  Checkbox,
  Field,
  FormMessage,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./fields";

function AuthSelect({ defaultValue }: { defaultValue: AuthType }) {
  return (
    <div className="space-y-1">
      <label htmlFor="auth_type" className="text-sm font-medium">
        Autenticação
      </label>
      <select
        id="auth_type"
        name="auth_type"
        defaultValue={defaultValue}
        className={inputClass}
      >
        {AUTH_TYPES.map((type) => (
          <option key={type} value={type}>
            {AUTH_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreateEnvironmentForm() {
  const [state, action, pending] = useActionState(createEnvironment, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-medium">Novo ambiente</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="name"
          label="Nome"
          placeholder="QA"
          errors={state?.errors?.name}
        />
        <Field
          id="base_url"
          label="URL base"
          placeholder="https://meu-ambiente.fluig.com"
          errors={state?.errors?.base_url}
          hint="Somente o endereço do servidor (e contexto, se houver)."
        />
        <AuthSelect defaultValue="none" />
      </div>
      <div className="space-y-2">
        <Checkbox id="is_active" name="is_active" label="Ambiente ativo" defaultChecked />
        <Checkbox
          id="allow_write_methods"
          name="allow_write_methods"
          label="Permitir métodos que alteram dados (POST, PUT, PATCH, DELETE)"
          hint="Desligado por padrão: o ambiente fica somente leitura (GET, HEAD, OPTIONS)."
        />
      </div>
      <FormMessage ok={state?.ok} message={state?.message} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando..." : "Criar ambiente"}
      </button>
    </form>
  );
}

function CredentialsForm({ env }: { env: EnvironmentSummary }) {
  const [state, action, pending] = useActionState(saveCredentials, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (env.auth_type === "none") {
    return <p className="text-sm text-muted">Este ambiente não usa autenticação.</p>;
  }

  const e = state?.errors;
  return (
    <div className="space-y-3">
      <form ref={formRef} action={action} className="space-y-3" autoComplete="off">
        <input type="hidden" name="id" value={env.id} />
        <div className="grid gap-3 md:grid-cols-2">
          {env.auth_type === "basic" && (
            <>
              <Field id={`u-${env.id}`} name="username" label="Usuário" errors={e?.username} autoComplete="off" />
              <Field id={`p-${env.id}`} name="password" label="Senha" type="password" errors={e?.password} autoComplete="new-password" />
            </>
          )}
          {env.auth_type === "bearer" && (
            <Field id={`t-${env.id}`} name="token" label="Token" type="password" errors={e?.token} autoComplete="off" className="md:col-span-2" />
          )}
          {env.auth_type === "header" && (
            <>
              <Field id={`hn-${env.id}`} name="headerName" label="Nome do header" errors={e?.headerName} autoComplete="off" />
              <Field id={`hv-${env.id}`} name="headerValue" label="Valor" type="password" errors={e?.headerValue} autoComplete="off" />
            </>
          )}
          {env.auth_type === "oauth1" && (
            <>
              <Field id={`ck-${env.id}`} name="consumerKey" label="Consumer key" errors={e?.consumerKey} autoComplete="off" />
              <Field id={`cs-${env.id}`} name="consumerSecret" label="Consumer secret" type="password" errors={e?.consumerSecret} autoComplete="off" />
              <Field id={`tk-${env.id}`} name="token" label="Access token (opcional)" errors={e?.token} autoComplete="off" />
              <Field id={`ts-${env.id}`} name="tokenSecret" label="Token secret (opcional)" type="password" errors={e?.tokenSecret} autoComplete="off" />
            </>
          )}
        </div>
        <FormMessage ok={state?.ok} message={state?.message} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Salvando..." : env.has_credentials ? "Substituir credenciais" : "Salvar credenciais"}
          </button>
          <span className="text-xs text-muted">
            {env.has_credentials
              ? "Credenciais cadastradas (cifradas; nunca exibidas)."
              : "Nenhuma credencial cadastrada."}
          </span>
        </div>
      </form>
      {env.has_credentials && (
        <form action={clearCredentials}>
          <input type="hidden" name="id" value={env.id} />
          <button type="submit" className={secondaryButton}>
            Remover credenciais
          </button>
        </form>
      )}
    </div>
  );
}

export function EnvironmentCard({ env }: { env: EnvironmentSummary }) {
  const [state, action, pending] = useActionState(updateEnvironment, undefined);

  return (
    <article className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">{env.name}</h2>
          <p className="font-mono text-xs text-muted">{env.base_url}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded border border-border px-2 py-0.5 text-muted">
            {AUTH_LABELS[env.auth_type]}
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-muted">
            {env.allow_write_methods ? "Leitura e escrita" : "Somente leitura"}
          </span>
          {!env.is_active && (
            <span className="rounded border border-danger/40 px-2 py-0.5 text-danger">
              Inativo
            </span>
          )}
        </div>
      </header>

      <details className="space-y-3">
        <summary className="cursor-pointer text-sm text-accent">Editar ambiente</summary>
        <form action={action} className="mt-3 space-y-4">
          <input type="hidden" name="id" value={env.id} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field id={`n-${env.id}`} name="name" label="Nome" defaultValue={env.name} errors={state?.errors?.name} />
            <Field id={`b-${env.id}`} name="base_url" label="URL base" defaultValue={env.base_url} errors={state?.errors?.base_url} />
            <AuthSelect defaultValue={env.auth_type} />
          </div>
          <div className="space-y-2">
            <Checkbox id={`a-${env.id}`} name="is_active" label="Ambiente ativo" defaultChecked={env.is_active} />
            <Checkbox
              id={`w-${env.id}`}
              name="allow_write_methods"
              label="Permitir métodos que alteram dados (POST, PUT, PATCH, DELETE)"
              defaultChecked={env.allow_write_methods}
              hint="Alterar o tipo de autenticação remove as credenciais atuais."
            />
          </div>
          <FormMessage ok={state?.ok} message={state?.message} />
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>
      </details>

      <details className="space-y-3">
        <summary className="cursor-pointer text-sm text-accent">Credenciais</summary>
        <div className="mt-3">
          <CredentialsForm env={env} />
        </div>
      </details>

      <form action={deleteEnvironment} className="border-t border-border pt-3">
        <input type="hidden" name="id" value={env.id} />
        <button type="submit" className="text-sm text-danger hover:underline">
          Excluir ambiente
        </button>
      </form>
    </article>
  );
}
