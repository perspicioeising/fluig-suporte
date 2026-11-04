import Link from "next/link";
import { FlaskConical, Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listEnvironments } from "@/modules/environments/queries";
import { buildTesterHref } from "@/modules/builder/tester-link";
import { getHistoryDetail, listHistory } from "../queries";
import { historyToPrefill } from "../reopen";
import {
  HISTORY_PAGE_SIZE,
  HistorySearchSchema,
  historyQueryString,
  type HistoryDetail,
  type HistorySearch,
} from "../schemas";
import { DeleteFilteredButton, DeleteHistoryItemButton } from "./delete-buttons";
import { HistoryFilters } from "./history-filters";

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

function statusClass(status: number | null) {
  if (status === null) return "bg-danger/15 text-danger";
  if (status >= 200 && status < 300) return "bg-success/15 text-success";
  if (status >= 300 && status < 400) return "bg-accent/15 text-accent";
  return "bg-danger/15 text-danger";
}

function pretty(body: string | null) {
  if (!body) return "(vazio)";
  if (/^\s*[{[]/.test(body)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* mantém o original */
    }
  }
  return body;
}

function HeadersTable({ headers }: { headers: Record<string, string> | null }) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return <p className="text-xs text-muted">(nenhum)</p>;
  return (
    <table className="w-full text-left text-xs">
      <tbody className="divide-y divide-border">
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th scope="row" className="py-1 pr-3 align-top font-mono font-medium">{k}</th>
            <td className="py-1 font-mono break-all text-muted">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-border" open={title.startsWith("Corpo da resposta")}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{title}</summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}

function Detail({
  item,
  isMine,
  closeHref,
  testerHref,
  environmentName,
}: {
  item: HistoryDetail;
  isMine: boolean;
  closeHref: string;
  testerHref: string | null;
  environmentName: string | null;
}) {
  const [url, operation] = item.url.split(" :: ");
  return (
    <section aria-label="Detalhe da requisição" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs font-semibold text-accent">{item.method}</span>
            <span className={cn("rounded px-2 py-0.5 font-mono text-xs", statusClass(item.status_code))}>
              {item.status_code ?? "Sem resposta"}
            </span>
            <span className="text-xs text-muted">{item.duration_ms ?? "-"} ms</span>
            <span className="text-xs text-muted">{dateFormat.format(new Date(item.created_at))}</span>
          </div>
          <p className="font-mono text-xs break-all">{url}</p>
          {operation && <p className="text-xs text-muted">Operação SOAP: <span className="font-mono">{operation}</span></p>}
          <p className="text-xs text-muted">Ambiente: {environmentName ?? "removido"}</p>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Fechar detalhe" className="rounded p-1 text-muted hover:text-foreground">
          <X className="size-4" aria-hidden />
        </Link>
      </div>

      {item.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{item.error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {testerHref && (
          <Link href={testerHref} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            <FlaskConical className="size-4 text-accent" aria-hidden />
            Reabrir no API Tester
          </Link>
        )}
        <Link
          href={`/diagnostico?history=${item.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          <Stethoscope className="size-4 text-accent" aria-hidden />
          Diagnosticar
        </Link>
        {isMine && <DeleteHistoryItemButton id={item.id} closeHref={closeHref} />}
      </div>

      <p className="text-xs text-muted">
        Headers de autenticação e campos sensíveis foram mascarados (***) antes de gravar. Corpos longos são truncados.
      </p>

      <Block title="Headers da requisição"><HeadersTable headers={item.request_headers} /></Block>
      <Block title="Corpo da requisição">
        <pre className="max-h-72 overflow-auto font-mono text-xs whitespace-pre-wrap break-words">{pretty(item.request_body)}</pre>
      </Block>
      <Block title="Headers da resposta"><HeadersTable headers={item.response_headers} /></Block>
      <Block title="Corpo da resposta">
        <pre className="max-h-[28rem] overflow-auto font-mono text-xs whitespace-pre-wrap break-words">{pretty(item.response_body)}</pre>
      </Block>
    </section>
  );
}

/** Lê e valida a URL; carrega lista, ambientes e (se houver) o item aberto. */
export async function HistoryView({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const search: HistorySearch = HistorySearchSchema.parse({
    q: first(raw.q),
    kind: first(raw.kind),
    status: first(raw.status),
    period: first(raw.period),
    env: first(raw.env),
    mine: first(raw.mine),
    page: first(raw.page),
  });
  const itemId = first(raw.item);

  const [environments, { rows, total, userId }, detail] = await Promise.all([
    listEnvironments(),
    listHistory(search),
    itemId ? getHistoryDetail(itemId) : Promise.resolve(null),
  ]);
  const envById = new Map(environments.map((e) => [e.id, e]));
  const { page: _page, ...filter } = search;
  void _page;
  const filtered = Boolean(filter.q || filter.kind || filter.status || filter.period || filter.env);
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  const hrefWith = (extra: Record<string, string>, page = search.page) => {
    const qs = historyQueryString({ ...search, page }, extra);
    return qs ? `/historico?${qs}` : "/historico";
  };
  const closeHref = hrefWith({});

  let testerHref: string | null = null;
  if (detail) {
    const env = detail.environment_id ? envById.get(detail.environment_id) : undefined;
    const prefill = historyToPrefill(detail, env?.base_url ?? null);
    if (prefill) testerHref = buildTesterHref(prefill).href;
  }

  return (
    <div className="space-y-4">
      <HistoryFilters filter={filter} environments={environments.map((e) => ({ id: e.id, name: e.name }))} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" role="status">
          {total} {total === 1 ? "registro" : "registros"}
        </p>
        {userId && total > 0 && <DeleteFilteredButton filter={filter} filtered={filtered} />}
      </div>

      <div className={cn("grid gap-4", detail && "@5xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
            {filtered || filter.mine
              ? "Nenhum registro encontrado para os filtros informados."
              : "Nenhuma requisição executada ainda. As chamadas feitas no API Tester e no Laboratório SOAP aparecem aqui."}
          </p>
        ) : (
          <ul className="divide-y divide-border self-start rounded-lg border border-border bg-surface">
            {rows.map((row) => {
              const [url, operation] = row.url.split(" :: ");
              const active = detail?.id === row.id;
              return (
                <li key={row.id}>
                  <Link
                    href={hrefWith({ item: row.id })}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn("block space-y-1 px-4 py-3 hover:bg-surface-2", active && "bg-surface-2")}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 font-mono font-semibold text-accent">{row.method}</span>
                      <span className={cn("rounded px-1.5 py-0.5 font-mono", statusClass(row.status_code))}>
                        {row.status_code ?? "ERR"}
                      </span>
                      <span className="text-muted">{row.duration_ms ?? "-"} ms</span>
                      <span className="text-muted">{dateFormat.format(new Date(row.created_at))}</span>
                      <span className="text-muted">
                        {row.environment_id ? (envById.get(row.environment_id)?.name ?? "ambiente removido") : "ambiente removido"}
                      </span>
                      {row.user_id !== userId && <span className="rounded border border-border px-1.5 text-muted">outro membro</span>}
                    </div>
                    <p className="truncate font-mono text-xs">{operation ? `${operation} · ${url}` : url}</p>
                    {row.error && <p className="truncate text-xs text-danger">{row.error}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {detail ? (
          <Detail
            item={detail}
            isMine={detail.user_id === userId}
            closeHref={closeHref}
            testerHref={testerHref}
            environmentName={detail.environment_id ? (envById.get(detail.environment_id)?.name ?? null) : null}
          />
        ) : itemId ? (
          <p className="text-sm text-muted">Registro não encontrado (pode ter sido excluído).</p>
        ) : null}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
          {search.page > 1 ? (
            <Link href={hrefWith({}, search.page - 1)} className="text-accent hover:underline">Anterior</Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Página {search.page} de {totalPages}</span>
          {search.page < totalPages ? (
            <Link href={hrefWith({}, search.page + 1)} className="text-accent hover:underline">Próxima</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
