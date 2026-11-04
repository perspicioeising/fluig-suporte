"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import {
  Field,
  FormMessage,
  inputClass,
  primaryButton,
  secondaryButton,
} from "@/modules/environments/components/fields";
import {
  importWsdlFile,
  importWsdlFromEnvironment,
  listEnvironmentServices,
} from "../actions";

function Warnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">Avisos ({warnings.length})</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.slice(0, 20).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

function EnvironmentImport({ environments }: { environments: EnvironmentSummary[] }) {
  const active = environments.filter((e) => e.is_active);
  const [state, action, pending] = useActionState(importWsdlFromEnvironment, undefined);
  const [envId, setEnvId] = useState(active[0]?.id ?? "");
  const [services, setServices] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [listing, startListing] = useTransition();

  function loadServices() {
    setListError(null);
    startListing(async () => {
      const result = await listEnvironmentServices(envId);
      if (result.ok) {
        setServices(result.services);
        setSelected(new Set());
      } else {
        setServices([]);
        setListError(result.error);
      }
    });
  }

  if (active.length === 0) {
    return (
      <p className="text-xs text-muted">
        Cadastre um ambiente ativo em Configurações para importar WSDLs direto dele.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="imp-env" className="text-sm font-medium">Ambiente</label>
        <select
          id="imp-env"
          name="environmentId"
          value={envId}
          onChange={(e) => {
            setEnvId(e.target.value);
            setServices([]);
          }}
          className={inputClass}
        >
          {active.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <button type="button" onClick={loadServices} disabled={listing || !envId} className={secondaryButton}>
        {listing ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden />Consultando...</span>
        ) : (
          "Listar serviços do ambiente"
        )}
      </button>
      {listError && <p role="alert" className="text-xs text-danger">{listError}</p>}

      {services.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Serviços ({selected.size}/{services.length})
          </legend>
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() => setSelected(selected.size === services.length ? new Set() : new Set(services))}
          >
            {selected.size === services.length ? "Limpar seleção" : "Selecionar todos"}
          </button>
          <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-border bg-surface-2 p-2">
            {services.map((name) => (
              <label key={name} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="service"
                  value={name}
                  checked={selected.has(name)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(name);
                    else next.delete(name);
                    setSelected(next);
                  }}
                  className="accent-[var(--accent)]"
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field
        id="imp-path"
        name="customPath"
        label="Ou informe o caminho do WSDL"
        placeholder="/webdesk/ECMDatasetService?wsdl"
        hint="Opcional. O caminho é sempre relativo ao ambiente selecionado."
        autoComplete="off"
      />

      <FormMessage ok={state?.ok} message={state?.message} />
      <Warnings warnings={state?.warnings} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Importando..." : "Importar do ambiente"}
      </button>
    </form>
  );
}

function FileImport() {
  const [state, action, pending] = useActionState(importWsdlFile, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="wsdl-file" className="text-sm font-medium">Arquivo WSDL</label>
        <input
          id="wsdl-file"
          name="file"
          type="file"
          accept=".wsdl,.xml,text/xml,application/xml"
          required
          className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>
      <Field id="wsdl-name" name="name" label="Nome (opcional)" placeholder="Meu serviço" autoComplete="off" />
      <FormMessage ok={state?.ok} message={state?.message} />
      <Warnings warnings={state?.warnings} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Importando..." : "Importar arquivo"}
      </button>
    </form>
  );
}

export function ImportPanel({ environments }: { environments: EnvironmentSummary[] }) {
  const [tab, setTab] = useState<"env" | "file">("env");
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div role="tablist" aria-label="Origem do WSDL" className="flex gap-1 border-b border-border">
        {(
          [
            ["env", "Do ambiente"],
            ["file", "Arquivo"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "border-b-2 border-accent px-3 py-1.5 text-sm text-foreground"
                : "px-3 py-1.5 text-sm text-muted hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "env" ? <EnvironmentImport environments={environments} /> : <FileImport />}
    </div>
  );
}
