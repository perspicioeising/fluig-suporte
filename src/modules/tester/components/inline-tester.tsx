"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Send, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import type { CatalogEntry, CatalogParameter } from "@/modules/catalog/types";
import { documentedRows } from "@/modules/builder/tester-link";
import { suggestBody } from "@/modules/builder/generators/json";
import { fillPathParams } from "@/modules/builder/generators/common";
import {
  BODY_TYPES,
  READ_ONLY_METHODS,
  type BodyType,
  type HttpMethod,
  type KeyValue,
} from "../schemas";

const BODY_LABELS: Record<BodyType, string> = {
  none: "Sem corpo",
  json: "JSON",
  xml: "XML",
  text: "Texto",
  form: "Formulário (urlencoded)",
};
import { useExecuteRequest } from "../use-execute";
import { KeyValueEditor } from "./key-value-editor";
import { ResponseView } from "./response-view";

const fieldClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

/**
 * API Tester embutido no detalhe do catálogo: o usuário vê a documentação, preenche os
 * parâmetros (obrigatórios já listados) e executa SEM sair da página. Reaproveita a mesma
 * rota, validação e componentes da tela do API Tester.
 */
export function InlineTester({
  entry,
  parameters,
  environments,
  onDiagnose,
}: {
  entry: CatalogEntry;
  parameters: CatalogParameter[];
  environments: EnvironmentSummary[];
  /** Chamado ao clicar em "Diagnosticar este erro": leva um resumo pronto ao painel lateral. */
  onDiagnose?: (summary: string, environmentId: string) => void;
}) {
  const router = useRouter();
  const activeEnvs = environments.filter((e) => e.is_active);

  const method = (entry.http_method ?? "GET").toUpperCase() as HttpMethod;
  // A documentação do REST antigo lista o caminho sem o prefixo da API pública.
  const basePath = entry.kind === "rest_old" ? `/api/public${entry.path ?? ""}` : (entry.path ?? "/");
  const pathNames = useMemo(() => [...basePath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]), [basePath]);
  const pathDocs = useMemo(
    () => new Map(parameters.filter((p) => p.location === "path").map((p) => [p.name, p] as const)),
    [parameters],
  );
  const docRows = useMemo(() => documentedRows(parameters), [parameters]);
  const canHaveBody = !["GET", "HEAD", "OPTIONS"].includes(method);
  const suggestion = useMemo(
    () => (canHaveBody ? suggestBody(entry, parameters) : null),
    [canHaveBody, entry, parameters],
  );

  const [envId, setEnvId] = useState(activeEnvs[0]?.id ?? "");
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<KeyValue[]>(docRows.query);
  const [headers, setHeaders] = useState<KeyValue[]>(docRows.headers);
  const [body, setBody] = useState(suggestion?.body ?? "");
  // Tipo do corpo começa deduzido do exemplo (JSON/XML); o usuário pode trocar.
  const [bodyType, setBodyType] = useState<BodyType>(
    canHaveBody && (suggestion?.body ?? "").trim()
      ? (suggestion!.body.trimStart().startsWith("<") ? "xml" : "json")
      : "none",
  );

  const { loading, response, error, execute } = useExecuteRequest(() => router.refresh());

  const env = environments.find((e) => e.id === envId);
  const writeBlocked = !!env && !env.allow_write_methods && !READ_ONLY_METHODS.includes(method);

  const { path: finalPath, missing } = fillPathParams(basePath, pathValues, "braces");
  const requiredEmpty = [...query, ...headers]
    .filter((r) => r.enabled && r.required && r.key && !r.value.trim())
    .map((r) => r.key);

  if (activeEnvs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
        Para testar aqui, cadastre e ative um ambiente Fluig em{" "}
        <Link href="/configuracoes" className="text-accent hover:underline">Configurações</Link>.
      </p>
    );
  }

  return (
    <section aria-label="Testar esta API" className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-xs font-medium text-accent">{method}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={basePath}>{basePath}</code>
      </div>

      <div className="flex flex-col gap-2 @xl/main:flex-row @xl/main:items-end">
        <div className="space-y-1">
          <label htmlFor="inline-env" className="text-xs font-medium">Ambiente</label>
          <select
            id="inline-env"
            value={envId}
            onChange={(e) => setEnvId(e.target.value)}
            className={cn(fieldClass, "w-full @xl/main:w-56")}
          >
            {activeEnvs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.allow_write_methods ? "" : " (leitura)"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            void execute({ environmentId: envId, method, path: finalPath, query, headers, bodyType, body })
          }
          disabled={loading || !envId || writeBlocked || missing.length > 0}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Executar
        </button>
      </div>

      {pathNames.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Parâmetros de caminho</h4>
          <div className="grid gap-3 @md/main:grid-cols-2">
            {pathNames.map((name) => {
              const doc = pathDocs.get(name);
              const hint = doc ? [doc.data_type, doc.description].filter(Boolean).join(" · ") : undefined;
              return (
                <div key={name} className="space-y-1">
                  <label htmlFor={`ip-${name}`} className="text-xs font-medium">
                    {name} <span className="text-danger" title="Obrigatório">*</span>
                  </label>
                  <input
                    id={`ip-${name}`}
                    value={pathValues[name] ?? ""}
                    onChange={(e) => setPathValues((v) => ({ ...v, [name]: e.target.value }))}
                    placeholder={hint}
                    title={hint}
                    className={cn(fieldClass, "w-full font-mono")}
                    autoComplete="off"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Query, Headers e Corpo sempre disponíveis (como no API Tester completo); os
          parâmetros documentados já vêm preenchidos, e dá para adicionar os seus. */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Parâmetros de query</h4>
        <KeyValueEditor label="Parâmetros de query" rows={query} onChange={setQuery} keyPlaceholder="parâmetro" />
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Headers</h4>
        <KeyValueEditor label="Headers" rows={headers} onChange={setHeaders} keyPlaceholder="Header" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Corpo da requisição</h4>
          <label htmlFor="inline-body-type" className="sr-only">Tipo do corpo</label>
          <select
            id="inline-body-type"
            value={bodyType}
            onChange={(e) => setBodyType(e.target.value as BodyType)}
            className={cn(fieldClass, "py-1 text-xs")}
          >
            {BODY_TYPES.map((t) => (
              <option key={t} value={t}>{BODY_LABELS[t]}</option>
            ))}
          </select>
        </div>
        {bodyType !== "none" && (
          <>
            <label htmlFor="inline-body" className="sr-only">Corpo da requisição</label>
            <textarea
              id="inline-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={bodyType === "json" ? '{\n  "chave": "valor"\n}' : bodyType === "xml" ? "<root>...</root>" : ""}
              className={cn(fieldClass, "w-full font-mono text-xs")}
            />
            {!canHaveBody && (
              <p className="text-xs text-muted">Requisições {method} normalmente não enviam corpo.</p>
            )}
            {suggestion?.source === "documentacao" && (
              <p className="text-xs text-muted">Preenchido com o exemplo da documentação oficial.</p>
            )}
            {suggestion?.source === "swagger" && (
              <p className="text-xs text-muted">Esqueleto dos campos do Swagger; remova os opcionais que não precisar.</p>
            )}
          </>
        )}
      </div>

      {writeBlocked && (
        <p role="alert" className="text-xs text-danger">
          O ambiente &quot;{env?.name}&quot; está em modo somente leitura. Habilite métodos de escrita em
          Configurações para usar {method}.
        </p>
      )}
      {missing.length > 0 && (
        <p role="alert" className="text-xs text-danger">
          Preencha {missing.map((n) => `{${n}}`).join(", ")} no caminho antes de executar.
        </p>
      )}
      {requiredEmpty.length > 0 && (
        <p role="status" className="text-xs text-accent">
          Parâmetros obrigatórios sem valor segundo a documentação: {requiredEmpty.join(", ")}.
        </p>
      )}
      <p className="text-xs text-muted">
        A autenticação do ambiente é aplicada no servidor; credenciais nunca vão no navegador. Precisa de mais opções?{" "}
        <Link href="/tester" className="text-accent hover:underline">Abrir o API Tester completo</Link>.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
      )}
      {response && (
        <div className="space-y-2">
          {onDiagnose && (response.status === null || response.status >= 400) && (
            <button
              type="button"
              onClick={() => onDiagnose(summarizeError(method, response), envId)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Stethoscope className="size-4 text-accent" aria-hidden />
              Diagnosticar este erro
            </button>
          )}
          <ResponseView response={response} />
        </div>
      )}
    </section>
  );
}

/** Resumo do erro para preencher o Diagnóstico (sem credenciais; a URL já vem mascarada). */
function summarizeError(method: HttpMethod, response: { status: number | null; statusText: string; url: string; error?: string; body: string }): string {
  const status = response.status === null ? "sem resposta" : `${response.status} ${response.statusText}`;
  const lines = [`${method} ${response.url} retornou ${status}.`];
  if (response.error) lines.push(`Erro: ${response.error}`);
  if (response.body?.trim()) lines.push("", "Corpo da resposta:", response.body.slice(0, 4000));
  return lines.join("\n");
}
