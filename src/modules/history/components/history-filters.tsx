"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HISTORY_KINDS,
  HISTORY_PERIODS,
  HISTORY_STATUS,
  KIND_LABELS,
  PERIOD_LABELS,
  STATUS_LABELS,
  historyQueryString,
  type HistoryFilter,
} from "../schemas";

const selectClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm";
const DEBOUNCE_MS = 250;
const EMPTY: Required<{ [K in keyof HistoryFilter]: string }> = {
  q: "",
  kind: "",
  status: "",
  period: "",
  env: "",
  mine: "",
};

/** Filtros do histórico: atualizam a lista ao digitar/escolher (estado na URL). */
export function HistoryFilters({
  filter,
  environments,
}: {
  filter: HistoryFilter;
  environments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ ...EMPTY, ...filter });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function navigate(next: typeof values, immediate: boolean) {
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    const go = () => {
      // Valores vazios são omitidos por historyQueryString; a página volta para 1.
      const qs = historyQueryString(next as Partial<HistoryFilter>);
      startTransition(() => router.replace(qs ? `/historico?${qs}` : "/historico", { scroll: false }));
    };
    if (immediate) go();
    else timer.current = setTimeout(go, DEBOUNCE_MS);
  }

  // Chamado só dentro dos handlers de evento (nunca durante o render).
  function update(key: keyof typeof values, value: string) {
    navigate({ ...values, [key]: value }, true);
  }
  const hasFilters = Object.values(values).some((v) => v);

  return (
    <form
      action="/historico"
      method="get"
      role="search"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(values, true);
      }}
    >
      <div className="flex flex-col gap-2 @2xl/main:flex-row">
        <label htmlFor="h-q" className="sr-only">Buscar no histórico</label>
        <input
          id="h-q"
          name="q"
          type="search"
          maxLength={100}
          autoComplete="off"
          value={values.q}
          onChange={(e) => navigate({ ...values, q: e.target.value }, false)}
          placeholder="Buscar por URL, método, operação SOAP ou mensagem de erro"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => navigate({ ...EMPTY }, true)}
          disabled={!hasFilters}
          className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          Limpar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="h-kind" className="sr-only">Tipo</label>
        <select id="h-kind" name="kind" value={values.kind} onChange={(e) => update("kind", e.target.value)} className={selectClass}>
          <option value="">REST e SOAP</option>
          {HISTORY_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>

        <label htmlFor="h-status" className="sr-only">Resultado</label>
        <select id="h-status" name="status" value={values.status} onChange={(e) => update("status", e.target.value)} className={selectClass}>
          <option value="">Qualquer resultado</option>
          {HISTORY_STATUS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <label htmlFor="h-period" className="sr-only">Período</label>
        <select id="h-period" name="period" value={values.period} onChange={(e) => update("period", e.target.value)} className={selectClass}>
          <option value="">Todo o período</option>
          {HISTORY_PERIODS.map((p) => (
            <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
          ))}
        </select>

        <label htmlFor="h-env" className="sr-only">Ambiente</label>
        <select id="h-env" name="env" value={values.env} onChange={(e) => update("env", e.target.value)} className={`${selectClass} max-w-56`}>
          <option value="">Todos os ambientes</option>
          {environments.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            name="mine"
            value="1"
            checked={values.mine === "1"}
            onChange={(e) => navigate({ ...values, mine: e.target.checked ? "1" : "" }, true)}
            className="accent-[var(--accent)]"
          />
          Somente as minhas
        </label>

        <button type="submit" className="sr-only">Filtrar</button>
        {pending && <span role="status" className="text-xs text-muted">Atualizando...</span>}
      </div>
    </form>
  );
}
