import Link from "next/link";
import { ENTRY_KINDS, KIND_LABELS, type CatalogSearch } from "../types";

/** Formulário GET: funciona sem JavaScript e mantém o estado na URL. */
export function CatalogFilters({ search }: { search: CatalogSearch }) {
  return (
    <form
      action="/catalogo"
      method="get"
      role="search"
      className="flex flex-col gap-2 sm:flex-row"
    >
      <label className="sr-only" htmlFor="q">
        Buscar no catálogo
      </label>
      <input
        id="q"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={search.q ?? ""}
        placeholder="Buscar por nome, caminho ou descrição"
        className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
      />

      <label className="sr-only" htmlFor="kind">
        Tipo
      </label>
      <select
        id="kind"
        name="kind"
        defaultValue={search.kind ?? ""}
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
      >
        <option value="">Todos os tipos</option>
        {ENTRY_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        Buscar
      </button>
      <Link
        href="/catalogo"
        className="rounded-md px-3 py-2 text-center text-sm text-muted hover:bg-surface-2"
      >
        Limpar
      </Link>
    </form>
  );
}
