"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { IssueSolution } from "../solutions-types";

/** Par id→query enviado à rota de soluções (usado por achados de config, ids dinâmicos). */
export type SolutionQueryInput = { id: string; query: string };

/**
 * Busca, após a análise, as páginas oficiais (TDN) correspondentes aos itens informados.
 * Determinístico e sem IA: leva o analista direto à solução documentada. Falha silenciosa
 * (a base pode não estar instalada) — nesse caso nenhuma sugestão é exibida.
 *
 * Aceita duas formas de entrada, combináveis:
 *  - `issueIds` + `hasSlow`: problemas conhecidos do log (query vem do servidor).
 *  - `queries`: pares id→query diretos (achados de config, cujos ids são dinâmicos).
 */
export function useSolutions(opts: {
  issueIds?: string[];
  hasSlow?: boolean;
  queries?: SolutionQueryInput[];
}): Map<string, IssueSolution> {
  const [byIssue, setByIssue] = useState<Map<string, IssueSolution>>(new Map());

  const issueIdsKey = (opts.issueIds ?? []).join(",");
  const hasSlow = opts.hasSlow ?? false;
  const queriesKey = (opts.queries ?? []).map((q) => `${q.id}=${q.query}`).join("|");

  useEffect(() => {
    const issueIds = issueIdsKey ? issueIdsKey.split(",") : [];
    const queries = queriesKey
      ? queriesKey.split("|").map((pair) => {
          const eq = pair.indexOf("=");
          return { id: pair.slice(0, eq), query: pair.slice(eq + 1) };
        })
      : [];
    if (issueIds.length === 0 && !hasSlow && queries.length === 0) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/support/solutions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueIds, hasSlow, queries }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { solutions?: IssueSolution[] };
        const map = new Map<string, IssueSolution>();
        for (const s of data.solutions ?? []) map.set(s.issueId, s);
        if (!controller.signal.aborted) setByIssue(map);
      } catch {
        // rede/base indisponível: segue sem sugestões
      }
    })();
    return () => controller.abort();
  }, [issueIdsKey, hasSlow, queriesKey]);

  return byIssue;
}

export function SolutionLink({ solution }: { solution: IssueSolution }) {
  return (
    <div className="mt-2 rounded-md border border-accent/30 bg-accent/5 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
        <BookOpen className="size-3.5 shrink-0" aria-hidden />
        Solução na documentação oficial
      </p>
      <a
        href={solution.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 inline-block text-sm font-medium hover:underline"
      >
        {solution.title}
      </a>
      {solution.snippet && <p className="mt-1 text-xs text-muted">{solution.snippet}…</p>}
    </div>
  );
}
