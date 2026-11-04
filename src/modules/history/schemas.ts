import * as z from "zod";

export const HISTORY_KINDS = ["rest", "soap"] as const;
export const HISTORY_STATUS = ["ok", "erro"] as const;
export const HISTORY_PERIODS = ["24h", "7d", "30d"] as const;

export const KIND_LABELS: Record<(typeof HISTORY_KINDS)[number], string> = { rest: "REST", soap: "SOAP" };
export const STATUS_LABELS: Record<(typeof HISTORY_STATUS)[number], string> = {
  ok: "Sucesso (2xx)",
  erro: "Erro ou sem resposta",
};
export const PERIOD_LABELS: Record<(typeof HISTORY_PERIODS)[number], string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

/** Filtros vindos da URL (entrada não confiável): valores inválidos são descartados. */
export const HistorySearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  kind: z.enum(HISTORY_KINDS).optional().catch(undefined),
  status: z.enum(HISTORY_STATUS).optional().catch(undefined),
  period: z.enum(HISTORY_PERIODS).optional().catch(undefined),
  env: z.uuid().optional().catch(undefined),
  mine: z
    .enum(["1"])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type HistorySearch = z.infer<typeof HistorySearchSchema>;

/** Só os filtros (sem página), usados também na exclusão em lote. */
export const HistoryFilterSchema = HistorySearchSchema.omit({ page: true });
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

export const HISTORY_PAGE_SIZE = 25;

export type HistoryRow = {
  id: string;
  user_id: string;
  environment_id: string | null;
  kind: "rest" | "soap";
  method: string;
  url: string;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

export type HistoryDetail = HistoryRow & {
  request_headers: Record<string, string>;
  request_body: string | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
};

const PERIOD_MS: Record<(typeof HISTORY_PERIODS)[number], number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

/** Data mínima (ISO) do período escolhido. `now` é parâmetro para facilitar testes. */
export function periodStart(period: HistoryFilter["period"], now = Date.now()): string | null {
  return period ? new Date(now - PERIOD_MS[period]).toISOString() : null;
}

/** Termos da busca (até 6), sem caracteres com significado em filtros PostgREST/ILIKE. */
export function historyTerms(q: string | undefined): string[] {
  return (q ?? "")
    .replace(/[%_*\\,():"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

/** Monta a query string dos filtros (mantém a URL curta: só o que foi definido). */
export function historyQueryString(filter: Partial<HistorySearch>, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const key of ["q", "kind", "status", "period", "env", "mine"] as const) {
    const value = filter[key];
    if (value) params.set(key, String(value));
  }
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}
