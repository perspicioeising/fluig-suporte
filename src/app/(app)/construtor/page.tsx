import { Suspense } from "react";
import Link from "next/link";
import * as z from "zod";
import type { Metadata } from "next";
import { getFacets, searchEntries } from "@/modules/catalog/queries";
import { CatalogSearchSchema } from "@/modules/catalog/types";
import { KindBadge, MethodBadge } from "@/modules/catalog/components/kind-badge";
import { listEnvironments } from "@/modules/environments/queries";
import { getBuilderEntry } from "@/modules/builder/queries";
import { BuilderSearch } from "@/modules/builder/components/builder-search";
import { BuilderPanel } from "@/modules/builder/components/builder-panel";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Construtor" };

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function BuilderPage({ searchParams }: PageProps<"/construtor">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Construtor de integrações</h1>
        <p className="text-sm text-muted">
          Escolha uma API, um serviço SOAP ou um método do SDK e gere exemplos em cURL, JavaScript, Java, JSON e XML.
          O código usa apenas o que consta na documentação oficial; o que não é documentado fica como marcador.
        </p>
      </div>

      <Suspense
        fallback={
          <LoadingState label="Carregando..." />
        }
      >
        <BuilderContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function BuilderContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const search = CatalogSearchSchema.parse({ q: first(raw.q), kind: first(raw.kind), method: first(raw.method), topic: first(raw.topic), page: 1 });
  const entryParam = first(raw.entry);
  const entryId = z.uuid().safeParse(entryParam).success ? (entryParam as string) : null;

  const hasFilter = Boolean(search.q || search.kind || search.method || search.topic);
  const [environments, results, builderEntry, facets] = await Promise.all([
    listEnvironments(),
    hasFilter ? searchEntries(search) : Promise.resolve(null),
    entryId ? getBuilderEntry(entryId) : Promise.resolve(null),
    getFacets(undefined),
  ]);

  const baseParams = new URLSearchParams();
  if (search.q) baseParams.set("q", search.q);
  if (search.kind) baseParams.set("kind", search.kind);
  if (search.method) baseParams.set("method", search.method);
  if (search.topic) baseParams.set("topic", search.topic);

  return (
    <div className="grid gap-4 @2xl/main:grid-cols-[20rem_minmax(0,1fr)]">
      <aside aria-label="Escolher API" className="space-y-3 rounded-lg border border-border bg-surface p-3 @2xl/main:max-h-[calc(100vh-12rem)] @2xl/main:overflow-auto">
        <BuilderSearch
          initial={{ q: search.q ?? "", kind: search.kind ?? "", method: search.method ?? "", topic: search.topic ?? "" }}
          entryId={entryId}
          topicsAvailable={facets.topicsAvailable}
        />

        {results === null ? (
          <p className="text-xs text-muted">Busque por um método (ex.: getAvailableDatasets), serviço (ECMDatasetService) ou caminho.</p>
        ) : results.entries.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma entrada encontrada.</p>
        ) : (
          <>
            <p className="text-xs text-muted" role="status">
              {results.total} resultado{results.total === 1 ? "" : "s"}
              {results.total > results.entries.length ? ` (mostrando ${results.entries.length}; refine a busca)` : ""}
            </p>
            <ul className="space-y-0.5">
              {results.entries.map((entry) => {
                const params = new URLSearchParams(baseParams);
                params.set("entry", entry.id);
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/construtor?${params.toString()}`}
                      aria-current={entry.id === entryId ? "page" : undefined}
                      className={cn(
                        "block rounded px-2 py-1.5 hover:bg-surface-2",
                        entry.id === entryId && "bg-surface-2",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MethodBadge method={entry.http_method} />
                        <KindBadge kind={entry.kind} />
                      </div>
                      <p className="mt-0.5 break-all text-sm">{entry.name}</p>
                      {entry.path && <p className="break-all font-mono text-[11px] text-muted">{entry.path}</p>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>

      <div className="min-w-0">
        {builderEntry ? (
          <BuilderPanel
            key={builderEntry.entry.id}
            data={builderEntry}
            environments={environments
              .filter((e) => e.is_active)
              .map((e) => ({ id: e.id, name: e.name, base_url: e.base_url }))}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
            {entryId
              ? "Entrada não encontrada."
              : "Selecione uma entrada na lista (ou use o botão \"Gerar código\" no catálogo) para ver os exemplos."}
          </p>
        )}
      </div>
    </div>
  );
}
