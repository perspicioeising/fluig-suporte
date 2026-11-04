import Link from "next/link";
import { searchEntries } from "../queries";
import { PAGE_SIZE, type CatalogSearch } from "../types";
import { KindBadge, MethodBadge } from "./kind-badge";

function pageHref(search: CatalogSearch, page: number) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.kind) params.set("kind", search.kind);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/catalogo?${qs}` : "/catalogo";
}

export async function CatalogResults({ search }: { search: CatalogSearch }) {
  const { entries, total } = await searchEntries(search);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (entries.length === 0) {
    const filtered = Boolean(search.q || search.kind);
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
        {filtered
          ? "Nenhuma entrada encontrada para os filtros informados."
          : "O catálogo ainda está vazio. As entradas serão carregadas pela importação da documentação oficial (fase 4)."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" role="status">
        {total} {total === 1 ? "entrada" : "entradas"}
      </p>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/catalogo/${entry.id}`}
              className="block space-y-1 p-4 hover:bg-surface-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method={entry.http_method} />
                <span className="font-medium">{entry.name}</span>
                <KindBadge kind={entry.kind} />
                {entry.is_deprecated && (
                  <span className="rounded border border-danger/40 px-1.5 py-0.5 text-xs text-danger">
                    Depreciado
                  </span>
                )}
              </div>
              {entry.path && (
                <p className="font-mono text-xs text-muted">{entry.path}</p>
              )}
              {entry.summary && (
                <p className="text-sm text-muted">{entry.summary}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between text-sm"
        >
          {search.page > 1 ? (
            <Link
              href={pageHref(search, search.page - 1)}
              className="text-accent hover:underline"
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {search.page} de {totalPages}
          </span>
          {search.page < totalPages ? (
            <Link
              href={pageHref(search, search.page + 1)}
              className="text-accent hover:underline"
            >
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
