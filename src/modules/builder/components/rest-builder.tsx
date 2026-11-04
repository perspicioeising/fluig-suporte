"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BodyType, HttpMethod, KeyValue } from "@/modules/tester/schemas";
import { fillPathParams } from "../generators/common";
import { suggestBody } from "../generators/json";
import { generateRestSnippets } from "../generators/rest";
import { buildTesterHref, documentedRows } from "../tester-link";
import type { BuilderEntry, Snippet } from "../types";
import { SnippetView } from "./snippet-view";

const fieldClass =
  "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

/**
 * Construtor REST: lista TODOS os parâmetros documentados (obrigatórios em destaque,
 * opcionais recolhidos) e leva tudo o que foi preenchido para o código e para o API Tester.
 */
export function RestBuilder({
  data,
  baseUrl,
  environmentId,
}: {
  data: BuilderEntry;
  baseUrl: string;
  environmentId: string;
}) {
  const { entry, parameters } = data;
  const method = (entry.http_method ?? "GET").toUpperCase() as HttpMethod;
  const rawPath = entry.path ?? "/";
  // A documentação do REST antigo lista o caminho sem o prefixo da API pública.
  const fullPath = entry.kind === "rest_old" ? `/api/public${rawPath}` : rawPath;

  const pathNames = useMemo(() => [...fullPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]), [fullPath]);
  const pathDocs = useMemo(
    () =>
      new Map(
        parameters.filter((p) => p.direction === "input" && p.location === "path").map((p) => [p.name, p] as const),
      ),
    [parameters],
  );
  // Parâmetros documentados: obrigatórios primeiro e habilitados; opcionais desabilitados.
  const docRows = useMemo(() => documentedRows(parameters), [parameters]);
  const suggestion = useMemo(() => suggestBody(entry, parameters), [entry, parameters]);

  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(suggestion.body);

  const { path: codePath, missing } = fillPathParams(fullPath, pathValues);
  const { path: testerPath } = fillPathParams(fullPath, pathValues, "braces");

  // Uma linha vale se for obrigatória ou se o usuário preencheu um valor.
  const resolve = (rows: KeyValue[], values: Record<string, string>): KeyValue[] =>
    rows.map((row) => {
      const value = (values[row.key] ?? row.value).trim();
      return { ...row, value, enabled: Boolean(row.required) || value !== "" };
    });
  const queryRows = resolve(docRows.query, queryValues);
  const headerRows = resolve(docRows.headers, headerValues);

  const canHaveBody = !["GET", "HEAD", "OPTIONS"].includes(method);
  const bodyType: BodyType = canHaveBody && body.trim() ? (body.trimStart().startsWith("<") ? "xml" : "json") : "none";

  // Nos exemplos de código, obrigatório sem valor vira PREENCHER_nome.
  const forCode = (rows: KeyValue[]) =>
    rows.filter((r) => r.enabled).map((r) => ({ key: r.key, value: r.value || `PREENCHER_${r.key}` }));

  const snippets: Snippet[] = (() => {
    const list = generateRestSnippets({
      method,
      baseUrl,
      path: codePath,
      query: forCode(queryRows),
      headers: forCode(headerRows),
      body: canHaveBody ? body : undefined,
    });
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

  const { href: testerHref, bodyDropped } = buildTesterHref({
    environmentId: environmentId || undefined,
    method,
    path: testerPath,
    query: queryRows,
    headers: headerRows,
    bodyType,
    body: canHaveBody ? body : "",
  });

  const requiredQuery = queryRows.filter((r) => r.required);
  const optionalQuery = queryRows.filter((r) => !r.required);
  const requiredHeaders = headerRows.filter((r) => r.required);
  const optionalHeaders = headerRows.filter((r) => !r.required);

  const renderField = (
    prefix: "q" | "h",
    row: KeyValue,
    values: Record<string, string>,
    setValues: (next: Record<string, string>) => void,
  ) => (
    <div key={`${prefix}-${row.key}`} className="space-y-1">
      <label htmlFor={`${prefix}-${row.key}`} className="text-xs font-medium">
        {row.key}
        {row.required && (
          <span className="text-danger" title="Obrigatório segundo a documentação">
            {" "}
            *
          </span>
        )}{" "}
        <span className="font-normal text-muted">
          ({prefix === "q" ? "query" : "header"}
          {row.required ? ", obrigatório" : ", opcional"})
        </span>
      </label>
      <input
        id={`${prefix}-${row.key}`}
        value={values[row.key] ?? row.value}
        onChange={(e) => setValues({ ...values, [row.key]: e.target.value })}
        placeholder={row.hint}
        title={row.hint}
        className={cn(fieldClass, "w-full font-mono")}
        autoComplete="off"
      />
    </div>
  );

  const hasInputs = pathNames.length > 0 || queryRows.length > 0 || headerRows.length > 0 || canHaveBody;

  return (
    <div className="space-y-4">
      {hasInputs && (
        <section aria-label="Valores" className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div>
            <h3 className="text-sm font-medium">Parâmetros da chamada</h3>
            <p className="text-xs text-muted">
              Os parâmetros <strong>obrigatórios</strong> da documentação já estão listados abaixo. Tudo o que você
              preencher vai junto para o código e para o API Tester.
            </p>
          </div>

          {pathNames.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Caminho</h4>
              <div className="grid gap-3 @md/main:grid-cols-2">
                {pathNames.map((name) => {
                  const doc = pathDocs.get(name);
                  const hint = doc ? [doc.data_type, doc.description].filter(Boolean).join(" · ") : undefined;
                  return (
                    <div key={name} className="space-y-1">
                      <label htmlFor={`p-${name}`} className="text-xs font-medium">
                        {name} <span className="text-danger">*</span>{" "}
                        <span className="font-normal text-muted">(caminho, obrigatório)</span>
                      </label>
                      <input
                        id={`p-${name}`}
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

          {queryRows.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Query</h4>
              {requiredQuery.length > 0 && (
                <div className="grid gap-3 @md/main:grid-cols-2">
                  {requiredQuery.map((r) => renderField("q", r, queryValues, setQueryValues))}
                </div>
              )}
              {optionalQuery.length > 0 && (
                <details className="rounded-md border border-border bg-surface-2 p-3">
                  <summary className="cursor-pointer text-xs">
                    Parâmetros opcionais ({optionalQuery.length}){" "}
                    <span className="text-muted">— preencha apenas os que precisar</span>
                  </summary>
                  <div className="mt-3 grid gap-3 @md/main:grid-cols-2">
                    {optionalQuery.map((r) => renderField("q", r, queryValues, setQueryValues))}
                  </div>
                </details>
              )}
            </div>
          )}

          {headerRows.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Headers documentados</h4>
              {requiredHeaders.length > 0 && (
                <div className="grid gap-3 @md/main:grid-cols-2">
                  {requiredHeaders.map((r) => renderField("h", r, headerValues, setHeaderValues))}
                </div>
              )}
              {optionalHeaders.length > 0 && (
                <details className="rounded-md border border-border bg-surface-2 p-3">
                  <summary className="cursor-pointer text-xs">Headers opcionais ({optionalHeaders.length})</summary>
                  <div className="mt-3 grid gap-3 @md/main:grid-cols-2">
                    {optionalHeaders.map((r) => renderField("h", r, headerValues, setHeaderValues))}
                  </div>
                </details>
              )}
            </div>
          )}

          {canHaveBody && (
            <div className="space-y-1">
              <label htmlFor="rest-body" className="text-xs font-semibold tracking-wide text-muted uppercase">
                Corpo da requisição
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
              {suggestion.source === "swagger" && (
                <p className="text-xs text-muted">
                  Campos do Swagger com valores de exemplo; remova os opcionais que não precisar.
                </p>
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

      <div className="space-y-1 text-sm">
        <Link
          href={testerHref}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 hover:bg-surface-2"
        >
          <Send className="size-4 text-accent" aria-hidden />
          Executar no API Tester
        </Link>
        <p className="text-xs text-muted">
          Leva ambiente, caminho, parâmetros, headers e corpo já preenchidos.
          {missing.length > 0 &&
            " Parâmetros de caminho sem valor seguem como {nome} e precisam ser preenchidos no Tester."}
          {bodyDropped && " O corpo era grande demais para a URL e não foi enviado; copie-o do campo acima."}
        </p>
      </div>
    </div>
  );
}
