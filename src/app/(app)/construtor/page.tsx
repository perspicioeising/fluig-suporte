import { Suspense } from "react";
import Link from "next/link";
import * as z from "zod";
import type { Metadata } from "next";
import { searchEntries } from "@/modules/catalog/queries";
import { CatalogSearchSchema, ENTRY_KINDS, KIND_LABELS } from "@/modules/catalog/types";
import { KindBadge, MethodBadge } from "@/modules/catalog/components/kind-badge";
import { listEnvironments } from "@/modules/environments/queries";
import { getBuilderEntry } from "@/modules/builder/queries";
import { BuilderPanel } from "@/modules/builder/components/builder-panel";
import { cn } from "@/lib/utils";

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
          <p role="status" className="text-sm text-muted">
            Carregando...
          </p>
        }
      >
        <BuilderContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function BuilderContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const search = CatalogSearchSchema.parse({ q: first(raw.q), kind: first(raw.kind), page: 1 });
  const entryParam = first(raw.entry);
  const entryId = z.uuid().safeParse(entryParam).success ? (entryParam as string) : null;

  const [environments, results, builderEntry] = await Promise.all([
    listEnvironments(),
    search.q || search.kind ? searchEntries(search) : Promise.resolve(null),
    entryId ? getBuilderEntry(entryId) : Promise.resolve(null),
  ]);

  const baseParams = new URLSearchParams();
  if (search.q) baseParams.set("q", search.q);
  if (search.kind) baseParams.set("kind", search.kind);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside aria-label="Escolher API" className="space-y-3 rounded-lg border border-border bg-surface p-3 lg:max-h-[calc(100vh-12rem)] lg:overflow-auto">
        <form action="/construtor" method="get" role="search" className="space-y-2">
          {entryId && <input type="hidden" name="entry" value={entryId} />}
          <label htmlFor="b-q" className="sr-only">Buscar</label>
          <input
            id="b-q"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            maxLength={100}
            placeholder="Nome, caminho ou descrição"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
          />
          <label htmlFor="b-kind" className="sr-only">Tipo</label>
          <select
            id="b-kind"
            name="kind"
            defaultValue={search.kind ?? ""}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="">Todos os tipos</option>
            {ENTRY_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Buscar
          </button>
        </form>

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
