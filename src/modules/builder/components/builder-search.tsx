"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TOPICS } from "@/modules/catalog/topics";
import { ENTRY_KINDS, HTTP_METHODS, KIND_LABELS } from "@/modules/catalog/types";

const fieldClass = "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";
const DEBOUNCE_MS = 250;

type Values = { q: string; kind: string; method: string; topic: string };

/** Busca do Construtor: atualiza a lista ao digitar/escolher (estado na URL, mantendo a entrada aberta). */
export function BuilderSearch({
  initial,
  entryId,
  topicsAvailable,
}: {
  initial: Values;
  entryId: string | null;
  topicsAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Values>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function navigate(next: Values, immediate: boolean) {
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    const go = () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v.trim()) params.set(k, v.trim());
      if (entryId) params.set("entry", entryId);
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `/construtor?${qs}` : "/construtor", { scroll: false }));
    };
    if (immediate) go();
    else timer.current = setTimeout(go, DEBOUNCE_MS);
  }

  return (
    <form
      action="/construtor"
      method="get"
      role="search"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(values, true);
      }}
    >
      {entryId && <input type="hidden" name="entry" value={entryId} />}
      <label htmlFor="b-q" className="sr-only">Buscar</label>
      <input
        id="b-q"
        name="q"
        type="search"
        autoComplete="off"
        value={values.q}
        onChange={(e) => navigate({ ...values, q: e.target.value }, false)}
        maxLength={100}
        placeholder="Nome, caminho ou descrição"
        className={fieldClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor="b-kind" className="sr-only">Tipo</label>
        <select id="b-kind" name="kind" value={values.kind} onChange={(e) => navigate({ ...values, kind: e.target.value }, true)} className={fieldClass}>
          <option value="">Todos os tipos</option>
          {ENTRY_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <label htmlFor="b-method" className="sr-only">Método HTTP</label>
        <select id="b-method" name="method" value={values.method} onChange={(e) => navigate({ ...values, method: e.target.value }, true)} className={fieldClass}>
          <option value="">Todos os métodos</option>
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      {topicsAvailable && (
        <>
          <label htmlFor="b-topic" className="sr-only">Assunto</label>
          <select id="b-topic" name="topic" value={values.topic} onChange={(e) => navigate({ ...values, topic: e.target.value }, true)} className={fieldClass}>
            <option value="">Todos os assuntos</option>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="sr-only">Buscar</button>
      {pending && <p role="status" className="text-xs text-muted">Atualizando...</p>}
    </form>
  );
}
