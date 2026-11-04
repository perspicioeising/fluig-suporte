"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TOPICS } from "../topics";
import { ENTRY_KINDS, HTTP_METHODS, KIND_LABELS, type CatalogSearch } from "../types";

const selectClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm";
const DEBOUNCE_MS = 250;

type Values = {
  q: string;
  kind: string;
  method: string;
  topic: string;
  group: string;
};

function toHref(v: Values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(v)) {
    if (value.trim()) params.set(key, value.trim());
  }
  const qs = params.toString();
  return qs ? `/catalogo?${qs}` : "/catalogo";
}

/**
 * Filtros que atualizam a lista enquanto o usuário digita ou escolhe (estado na URL).
 * O <form method="get"> continua funcionando sem JavaScript.
 */
export function CatalogFilters({
  search,
  groups,
  topicsAvailable,
}: {
  search: CatalogSearch;
  groups: string[];
  topicsAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Values>({
    q: search.q ?? "",
    kind: search.kind ?? "",
    method: search.method ?? "",
    topic: search.topic ?? "",
    group: search.group ?? "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function navigate(next: Values, immediate: boolean) {
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    const go = () => startTransition(() => router.replace(toHref(next), { scroll: false }));
    if (immediate) go();
    else timer.current = setTimeout(go, DEBOUNCE_MS);
  }

  const hasFilters = Object.values(values).some((v) => v.trim());

  return (
    <form action="/catalogo" method="get" role="search" className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      navigate(values, true);
    }}>
      <div className="flex flex-col gap-2 lg:flex-row">
        <label className="sr-only" htmlFor="q">Buscar no catálogo</label>
        <input
          id="q"
          name="q"
          type="search"
          maxLength={100}
          autoComplete="off"
          value={values.q}
          onChange={(e) => navigate({ ...values, q: e.target.value }, false)}
          placeholder="Buscar por nome, caminho ou descrição (sem diferenciar maiúsculas)"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => navigate({ q: "", kind: "", method: "", topic: "", group: "" }, true)}
          disabled={!hasFilters}
          className="rounded-md px-3 py-2 text-center text-sm text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          Limpar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="kind">Tipo</label>
        <select
          id="kind"
          name="kind"
          value={values.kind}
          // trocar o tipo invalida o grupo (os grupos dependem do tipo)
          onChange={(e) => navigate({ ...values, kind: e.target.value, group: "" }, true)}
          className={selectClass}
        >
          <option value="">Todos os tipos</option>
          {ENTRY_KINDS.map((kind) => (
            <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="method">Método HTTP</label>
        <select
          id="method"
          name="method"
          value={values.method}
          onChange={(e) => navigate({ ...values, method: e.target.value }, true)}
          className={selectClass}
        >
          <option value="">Todos os métodos</option>
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {topicsAvailable && (
          <>
            <label className="sr-only" htmlFor="topic">Assunto</label>
            <select
              id="topic"
              name="topic"
              value={values.topic}
              onChange={(e) => navigate({ ...values, topic: e.target.value }, true)}
              className={selectClass}
            >
              <option value="">Todos os assuntos</option>
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </>
        )}

        <label className="sr-only" htmlFor="group">Grupo (API, serviço ou classe)</label>
        <select
          id="group"
          name="group"
          value={values.group}
          disabled={!values.kind}
          onChange={(e) => navigate({ ...values, group: e.target.value }, true)}
          className={`${selectClass} max-w-64 disabled:opacity-50`}
          title={values.kind ? undefined : "Escolha um tipo para filtrar por grupo"}
        >
          <option value="">{values.kind ? "Todos os grupos" : "Grupo (escolha o tipo)"}</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <button type="submit" className="sr-only">Buscar</button>
        {pending && <span role="status" className="self-center text-xs text-muted">Atualizando...</span>}
      </div>
    </form>
  );
}
