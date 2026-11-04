"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveEndpoint } from "@/modules/soap/endpoint";
import { KindBadge, MethodBadge } from "@/modules/catalog/components/kind-badge";
import { fillPathParams } from "../generators/common";
import { suggestBody } from "../generators/json";
import { generateRestSnippets } from "../generators/rest";
import { generateSdkSnippets } from "../generators/sdk";
import { generateSoapSnippets, soapOperationFromCatalog } from "../generators/soap";
import type { BuilderEntry, BuilderEnvironment, Snippet } from "../types";
import { SnippetView } from "./snippet-view";

const fieldClass =
  "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";
const PLACEHOLDER_BASE = "https://SEU_FLUIG";

export function BuilderPanel({
  data,
  environments,
}: {
  data: BuilderEntry;
  environments: BuilderEnvironment[];
}) {
  const { entry } = data;
  const [envId, setEnvId] = useState(environments[0]?.id ?? "");
  const env = environments.find((e) => e.id === envId);

  const question = `Explique como usar ${entry.name} e mostre um exemplo de código, citando a documentação oficial.`;

  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={entry.http_method} />
          <h2 className="text-lg font-semibold break-all">{entry.name}</h2>
          <KindBadge kind={entry.kind} />
          {entry.is_deprecated && (
            <span className="rounded border border-danger/40 px-1.5 py-0.5 text-xs text-danger">Depreciado</span>
          )}
        </div>
        {entry.path && <p className="font-mono text-xs text-muted break-all">{entry.path}</p>}
        {entry.summary && <p className="text-sm">{entry.summary}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
          <Link href={`/catalogo/${entry.id}`} className="text-accent hover:underline">
            Ver documentação no catálogo
          </Link>
          <a
            href={entry.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            Fonte oficial <ExternalLink className="size-3" aria-hidden />
          </a>
          <Link
            href={`/assistente?ask=${encodeURIComponent(question)}`}
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            <MessageSquare className="size-3.5" aria-hidden />
            Pedir ajuda ao assistente
          </Link>
        </div>
      </header>

      {entry.kind !== "sdk" && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="builder-env" className="text-sm font-medium">
            Ambiente
          </label>
          <select
            id="builder-env"
            value={envId}
            onChange={(e) => setEnvId(e.target.value)}
            className={cn(fieldClass, "min-w-0 py-1.5")}
          >
            <option value="">Sem ambiente (usar marcador)</option>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.base_url}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">Define a URL base do código gerado. Credenciais nunca são incluídas.</span>
        </div>
      )}

      {entry.kind === "rest_new" || entry.kind === "rest_old" ? (
        <RestBuilder data={data} baseUrl={env?.base_url ?? PLACEHOLDER_BASE} />
      ) : entry.kind === "soap" ? (
        <SoapBuilder data={data} baseUrl={env?.base_url} />
      ) : (
        <SdkBuilder data={data} />
      )}
    </div>
  );
}

/* ---------------------------------- REST ---------------------------------- */

function RestBuilder({ data, baseUrl }: { data: BuilderEntry; baseUrl: string }) {
  const { entry, parameters } = data;
  const method = (entry.http_method ?? "GET").toUpperCase();
  const rawPath = entry.path ?? "/";
  // A documentação do REST antigo lista o caminho sem o prefixo da API pública.
  const fullPath = entry.kind === "rest_old" ? `/api/public${rawPath}` : rawPath;

  const pathNames = useMemo(() => [...fullPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]), [fullPath]);
  const queryParams = useMemo(
    () => parameters.filter((p) => p.direction === "input" && p.location === "query"),
    [parameters],
  );
  const suggestion = useMemo(() => suggestBody(entry, parameters), [entry, parameters]);

  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(suggestion.body);

  const { path: filledPath, missing } = fillPathParams(fullPath, pathValues);
  const query = queryParams
    .map((p) => ({
      key: p.name,
      value: queryValues[p.name]?.trim() ? queryValues[p.name].trim() : p.is_required ? `PREENCHER_${p.name}` : "",
      include: p.is_required || Boolean(queryValues[p.name]?.trim()),
    }))
    .filter((q) => q.include)
    .map(({ key, value }) => ({ key, value }));

  const canHaveBody = !["GET", "HEAD", "OPTIONS"].includes(method);

  const snippets: Snippet[] = (() => {
    const list = generateRestSnippets({ method, baseUrl, path: filledPath, query, body: canHaveBody ? body : undefined });
    if (body.trim()) {
      let pretty = body;
      try {
        pretty = JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        // mantém como está (ex.: exemplo com comentários)
      }
      list.push({
        id: "json",
        label: "JSON",
        language: "json",
        code: pretty,
        notes:
          suggestion.source === "swagger"
            ? ["Esqueleto montado a partir dos campos do Swagger. Tipos que referenciam outros objetos aparecem como {}."]
            : suggestion.source === "documentacao"
              ? ["Baseado no exemplo da documentação oficial."]
              : undefined,
      });
    }
    return list;
  })();

  const testerHref = `/tester?${new URLSearchParams({ method, path: filledPath }).toString()}`;

  return (
    <div className="space-y-4">
      {(pathNames.length > 0 || queryParams.length > 0 || canHaveBody) && (
        <section aria-label="Valores" className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">Valores do exemplo</h3>

          {pathNames.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {pathNames.map((name) => (
                <div key={name} className="space-y-1">
                  <label htmlFor={`p-${name}`} className="text-xs font-medium">
                    {name} <span className="text-muted">(caminho, obrigatório)</span>
                  </label>
                  <input
                    id={`p-${name}`}
                    value={pathValues[name] ?? ""}
                    onChange={(e) => setPathValues((v) => ({ ...v, [name]: e.target.value }))}
                    className={cn(fieldClass, "w-full font-mono")}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          )}

          {queryParams.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {queryParams.map((p) => (
                <div key={p.id} className="space-y-1">
                  <label htmlFor={`q-${p.name}`} className="text-xs font-medium">
                    {p.name}{" "}
                    <span className="text-muted">
                      ({p.data_type ?? "query"}
                      {p.is_required ? ", obrigatório" : ", opcional"})
                    </span>
                  </label>
                  <input
                    id={`q-${p.name}`}
                    value={queryValues[p.name] ?? ""}
                    onChange={(e) => setQueryValues((v) => ({ ...v, [p.name]: e.target.value }))}
                    placeholder={p.description ?? undefined}
                    className={cn(fieldClass, "w-full font-mono")}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          )}

          {canHaveBody && (
            <div className="space-y-1">
              <label htmlFor="rest-body" className="text-xs font-medium">
                Corpo da requisição (JSON)
              </label>
              <textarea
                id="rest-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                spellCheck={false}
                className={cn(fieldClass, "w-full font-mono text-xs")}
              />
              {suggestion.source === "documentacao" && (
                <p className="text-xs text-muted">Preenchido com o exemplo da documentação oficial.</p>
              )}
              {suggestion.source === "nenhum" && (
                <p className="text-xs text-muted">A documentação não traz um exemplo de corpo para esta entrada.</p>
              )}
            </div>
          )}
        </section>
      )}

      {missing.length > 0 && (
        <p className="text-xs text-muted">
          Preencha {missing.join(", ")} para substituir os marcadores PREENCHER_* no código.
        </p>
      )}

      <SnippetView snippets={snippets} />

      <p className="text-sm">
        <Link
          href={missing.length === 0 ? testerHref : `/tester?${new URLSearchParams({ method, path: fullPath }).toString()}`}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 hover:bg-surface-2"
        >
          <Send className="size-4 text-accent" aria-hidden />
          Executar no API Tester
        </Link>
      </p>
    </div>
  );
}

/* ---------------------------------- SOAP ---------------------------------- */

const CREDENTIAL_NAMES = /^(user|username|login|usuario|password|senha)$/i;

function SoapBuilder({ data, baseUrl }: { data: BuilderEntry; baseUrl?: string }) {
  const { entry, parameters } = data;
  const imported = data.soapOperation;
  const op = useMemo(() => imported ?? soapOperationFromCatalog(entry, parameters), [imported, entry, parameters]);
  const [values, setValues] = useState<Record<string, string>>({});

  const scalarParams = op.input.params.filter(
    (p) => !p.children?.length && !p.placeholder && !CREDENTIAL_NAMES.test(p.name),
  );

  const endpoint = imported
    ? imported.endpoint
      ? resolveEndpoint(baseUrl, imported.endpoint)
      : ""
    : `${(baseUrl ?? PLACEHOLDER_BASE).replace(/\/+$/, "")}/webdesk/${op.service}`;

  const notes = imported
    ? ["Gerado a partir do WSDL que você importou: endpoint, namespace e SOAPAction são os do WSDL."]
    : [
        "Gerado só com os dados do catálogo (TDN). Namespace e SOAPAction não são documentados e ficam como marcadores; importe o WSDL do serviço no Laboratório SOAP para obtê-los.",
        "O endereço foi derivado do padrão /webdesk/<Serviço> das URLs de WSDL citadas na documentação. Confirme no WSDL.",
      ];

  const snippets = generateSoapSnippets(op, endpoint, values, notes);

  return (
    <div className="space-y-4">
      {scalarParams.length > 0 && (
        <section aria-label="Argumentos" className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">Argumentos</h3>
          <p className="text-xs text-muted">
            Usuário e senha entram como marcadores (<code className="font-mono">SEU_USUARIO</code>/
            <code className="font-mono">SUA_SENHA</code>) nos exemplos.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {scalarParams.map((p) => (
              <div key={p.name} className="space-y-1">
                <label htmlFor={`a-${p.name}`} className="text-xs font-medium">
                  {p.name} <span className="text-muted">({p.type})</span>
                </label>
                <input
                  id={`a-${p.name}`}
                  value={values[p.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                  className={cn(fieldClass, "w-full font-mono")}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <SnippetView snippets={snippets} />

      <p className="text-sm">
        <Link
          href={data.soapWsdlId ? `/soap?wsdl=${data.soapWsdlId}` : "/soap"}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 hover:bg-surface-2"
        >
          <FlaskConical className="size-4 text-accent" aria-hidden />
          {data.soapWsdlId ? "Testar no Laboratório SOAP" : "Importar o WSDL no Laboratório SOAP"}
        </Link>
      </p>
    </div>
  );
}

/* ----------------------------------- SDK ---------------------------------- */

function SdkBuilder({ data }: { data: BuilderEntry }) {
  const { entry, parameters, sdkAccessor } = data;
  const [className, methodName] = entry.name.includes(".") ? entry.name.split(".") : [entry.name, ""];

  const snippets = useMemo(
    () => generateSdkSnippets({ className, methodName, parameters, accessor: sdkAccessor }),
    [className, methodName, parameters, sdkAccessor],
  );

  return (
    <div className="space-y-4">
      {entry.path && (
        <p className="rounded-md border border-border bg-surface p-3 font-mono text-xs break-all">
          <span className="text-muted">Assinatura (Javadoc): </span>
          {entry.path}
        </p>
      )}
      {entry.compatibility_notes && (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {entry.compatibility_notes}
        </p>
      )}
      <SnippetView snippets={snippets} />
    </div>
  );
}
