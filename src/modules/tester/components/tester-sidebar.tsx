"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteCollection, deleteSavedRequest } from "../actions";
import type {
  CollectionWithRequests,
  HistoryItem,
  SavedRequest,
} from "../schemas";

function statusColor(status: number | null) {
  if (status === null) return "text-danger";
  return status >= 200 && status < 300 ? "text-success" : "text-danger";
}

export function TesterSidebar({
  collections,
  history,
  onLoadSaved,
  onLoadHistory,
  onChanged,
}: {
  collections: CollectionWithRequests[];
  history: HistoryItem[];
  onLoadSaved: (request: SavedRequest) => void;
  onLoadHistory: (item: HistoryItem) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"collections" | "history">("collections");
  const [pending, startTransition] = useTransition();

  const remove = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      onChanged();
    });

  return (
    <aside aria-label="Coleções e histórico" className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div role="tablist" aria-label="Painel lateral" className="flex gap-1 border-b border-border">
        {(["collections", "history"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-sm text-muted hover:text-foreground",
              tab === t && "border-b-2 border-accent text-foreground",
            )}
          >
            {t === "collections" ? "Coleções" : "Histórico"}
          </button>
        ))}
      </div>

      {tab === "collections" ? (
        collections.length === 0 ? (
          <p className="text-xs text-muted">
            Nenhuma coleção. Use &quot;Salvar&quot; para guardar uma requisição.
          </p>
        ) : (
          <ul className="space-y-3" aria-busy={pending}>
            {collections.map((collection) => (
              <li key={collection.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                    {collection.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => remove(() => deleteCollection(collection.id))}
                    aria-label={`Excluir coleção ${collection.name}`}
                    className="rounded p-1 text-muted hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
                <ul>
                  {collection.saved_requests.length === 0 && (
                    <li className="text-xs text-muted">Vazia</li>
                  )}
                  {collection.saved_requests.map((request) => (
                    <li key={request.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onLoadSaved(request)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-accent">
                          {request.method}
                        </span>
                        <span className="truncate">{request.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(() => deleteSavedRequest(request.id))}
                        aria-label={`Excluir requisição ${request.name}`}
                        className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )
      ) : history.length === 0 ? (
        <p className="text-xs text-muted">Nenhuma requisição executada ainda.</p>
      ) : (
        <ul>
          <li className="px-2 pb-1 text-xs">
            <Link href="/historico?kind=rest" className="text-accent hover:underline">
              Ver histórico completo (filtros e exclusão)
            </Link>
          </li>
          {history.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onLoadHistory(item)}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-accent">
                    {item.method}
                  </span>
                  <span className={cn("font-mono", statusColor(item.status_code))}>
                    {item.status_code ?? "ERR"}
                  </span>
                  <span className="text-muted">{item.duration_ms ?? "-"} ms</span>
                </div>
                <p className="truncate font-mono text-[11px] text-muted">{item.url}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
