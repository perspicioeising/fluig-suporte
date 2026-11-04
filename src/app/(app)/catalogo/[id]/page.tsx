import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, Send, Wrench } from "lucide-react";
import { getEntry, parseExamples } from "@/modules/catalog/queries";
import {
  KindBadge,
  MethodBadge,
} from "@/modules/catalog/components/kind-badge";
import type { CatalogEntry, CatalogParameter } from "@/modules/catalog/types";
import { suggestBody } from "@/modules/builder/generators/json";
import { buildTesterHref, documentedRows } from "@/modules/builder/tester-link";
import type { HttpMethod } from "@/modules/tester/schemas";

export const metadata: Metadata = { title: "Detalhe da API" };

export default function EntryPage({ params }: PageProps<"/catalogo/[id]">) {
  return (
    <section className="space-y-6">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao catálogo
      </Link>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando...
          </p>
        }
      >
        <EntryDetail params={params} />
      </Suspense>
    </section>
  );
}

/** Link para o API Tester já com os parâmetros obrigatórios e o corpo sugerido pela documentação. */
function buildDetailTesterHref(entry: CatalogEntry, parameters: CatalogParameter[]) {
  const method = (entry.http_method ?? "GET").toUpperCase() as HttpMethod;
  const rows = documentedRows(parameters);
  const canHaveBody = !["GET", "HEAD", "OPTIONS"].includes(method);
  const suggestion = canHaveBody ? suggestBody(entry, parameters) : null;

  return buildTesterHref({
    method,
    // A documentação do REST antigo lista o caminho sem o prefixo da API pública.
    path: entry.kind === "rest_old" ? `/api/public${entry.path}` : (entry.path ?? "/"),
    query: rows.query,
    headers: rows.headers,
    bodyType: suggestion?.body ? "json" : "none",
    body: suggestion?.body ?? "",
  }).href;
}

async function EntryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getEntry(id);
  if (!result) notFound();

  const { entry, parameters } = result;
  const examples = parseExamples(entry.examples);
  const inputs = parameters.filter((p) => p.direction === "input");
  const outputs = parameters.filter((p) => p.direction === "output");
  const hasVersion = entry.min_version || entry.max_version;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={entry.http_method} />
          <h1 className="text-2xl font-semibold">{entry.name}</h1>
          <KindBadge kind={entry.kind} />
          {entry.is_deprecated && (
            <span className="rounded border border-danger/40 px-1.5 py-0.5 text-xs text-danger">
              Depreciado
            </span>
          )}
        </div>
        {entry.path && (
          <p className="font-mono text-sm text-muted">{entry.path}</p>
        )}
        {entry.summary && <p className="text-sm">{entry.summary}</p>}
      </header>

      {entry.description && (
        <Block title="Descrição">
          <p className="whitespace-pre-line text-sm text-muted">
            {entry.description}
          </p>
        </Block>
      )}

      <ParameterTable title="Parâmetros de entrada" items={inputs} />
      <ParameterTable title="Parâmetros de saída" items={outputs} />

      {examples.length > 0 && (
        <Block title="Exemplos">
          <div className="space-y-4">
            {examples.map((example, index) => (
              <figure key={index} className="space-y-1">
                {(example.title || example.language) && (
                  <figcaption className="text-xs text-muted">
                    {[example.title, example.language]
                      .filter(Boolean)
                      .join(" · ")}
                  </figcaption>
                )}
                <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs">
                  <code>{example.code}</code>
                </pre>
              </figure>
            ))}
          </div>
        </Block>
      )}

      {(hasVersion || entry.compatibility_notes) && (
        <Block title="Compatibilidade">
          <dl className="space-y-1 text-sm">
            {entry.min_version && (
              <Row label="Versão mínima" value={entry.min_version} />
            )}
            {entry.max_version && (
              <Row label="Versão máxima" value={entry.max_version} />
            )}
          </dl>
          {entry.compatibility_notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted">
              {entry.compatibility_notes}
            </p>
          )}
        </Block>
      )}

      <p className="text-sm">
        <Link
          href={`/construtor?entry=${entry.id}`}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-foreground hover:opacity-90"
        >
          <Wrench className="size-4" aria-hidden />
          Gerar código
        </Link>
      </p>

      {(entry.kind === "rest_new" || entry.kind === "rest_old") &&
        entry.path &&
        entry.http_method && (
          <div className="space-y-1 text-sm">
            <Link
              href={buildDetailTesterHref(entry, parameters)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-surface-2"
            >
              <Send className="size-4 text-accent" aria-hidden />
              Abrir no API Tester
            </Link>
            {entry.kind === "rest_old" && (
              <p className="text-xs text-muted">
                O API Tester usa o prefixo <code className="font-mono">/api/public</code> (API pública do Fluig,
                autenticada por OAuth 1.0a).
              </p>
            )}
          </div>
        )}

      <p className="text-sm">
        <a
          href={entry.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          Fonte oficial
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </article>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

const LOCATION_LABELS: Record<string, string> = {
  path: "path",
  query: "query",
  header: "header",
  body: "body",
  argument: "argumento",
  soap_part: "parte SOAP",
  return: "retorno",
};

function ParameterTable({
  title,
  items,
}: {
  title: string;
  items: CatalogParameter[];
}) {
  if (items.length === 0) return null;
  return (
    <Block title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-4 font-medium">Nome</th>
              <th className="py-1 pr-4 font-medium">Local</th>
              <th className="py-1 pr-4 font-medium">Tipo</th>
              <th className="py-1 pr-4 font-medium">Obrigatório</th>
              <th className="py-1 font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4 font-mono text-xs">{p.name}</td>
                <td className="py-2 pr-4 text-muted">
                  {LOCATION_LABELS[p.location] ?? p.location}
                </td>
                <td className="py-2 pr-4 text-muted">{p.data_type ?? "-"}</td>
                <td className="py-2 pr-4">{p.is_required ? "Sim" : "Não"}</td>
                <td className="py-2 text-muted">{p.description ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}
