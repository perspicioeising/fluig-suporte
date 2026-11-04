"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import { deleteWsdl } from "../actions";
import type { SoapOperationRecord, WsdlSummary } from "../schemas";
import { ImportPanel } from "./import-panel";
import { OperationPanel } from "./operation-panel";

export function SoapLab({
  environments,
  wsdls,
  selectedId,
  operations,
}: {
  environments: EnvironmentSummary[];
  wsdls: WsdlSummary[];
  selectedId: string | null;
  operations: SoapOperationRecord[];
}) {
  const [opId, setOpId] = useState<string | null>(operations[0]?.id ?? null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? operations.filter((o) => `${o.name} ${o.service}`.toLowerCase().includes(term))
      : operations;
  }, [operations, search]);

  const selectedOp = operations.find((o) => o.id === opId) ?? null;
  const selectedWsdl = wsdls.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <aside aria-label="WSDLs importados" className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <h2 className="text-sm font-medium">WSDLs importados</h2>
          {wsdls.length === 0 ? (
            <p className="text-xs text-muted">Nenhum WSDL ainda. Importe um abaixo.</p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-auto">
              {wsdls.map((wsdl) => (
                <li key={wsdl.id} className="group flex items-center gap-1">
                  <Link
                    href={`/soap?wsdl=${wsdl.id}`}
                    aria-current={wsdl.id === selectedId ? "page" : undefined}
                    className={cn(
                      "min-w-0 flex-1 rounded px-2 py-1 text-sm hover:bg-surface-2",
                      wsdl.id === selectedId && "bg-surface-2 text-accent",
                    )}
                  >
                    <span className="block truncate">{wsdl.name}</span>
                    <span className="text-[11px] text-muted">{wsdl.operation_count} operações</span>
                  </Link>
                  <form action={deleteWsdl}>
                    <input type="hidden" name="id" value={wsdl.id} />
                    <button
                      type="submit"
                      aria-label={`Excluir WSDL ${wsdl.name}`}
                      className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <ImportPanel environments={environments} />
      </div>

      <div className="min-w-0 space-y-4">
        {!selectedWsdl ? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
            Selecione um WSDL na lista ou importe um novo para ver suas operações.
          </p>
        ) : (
          <>
            <section aria-label="Operações" className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                  {selectedWsdl.name}{" "}
                  <span className="font-normal text-muted">({filtered.length}/{operations.length})</span>
                </h2>
                <div>
                  <label htmlFor="op-search" className="sr-only">Filtrar operações</label>
                  <input
                    id="op-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrar operações"
                    className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm placeholder:text-muted"
                  />
                </div>
              </div>
              <ul className="flex max-h-40 flex-wrap gap-1 overflow-auto">
                {filtered.map((op) => (
                  <li key={op.id}>
                    <button
                      type="button"
                      onClick={() => setOpId(op.id)}
                      aria-pressed={op.id === opId}
                      className={cn(
                        "rounded-md border border-border px-2 py-1 font-mono text-xs hover:bg-surface-2",
                        op.id === opId && "border-accent text-accent",
                      )}
                    >
                      {op.name}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="text-xs text-muted">Nenhuma operação encontrada.</li>}
              </ul>
            </section>

            {selectedOp && <OperationPanel key={selectedOp.id} op={selectedOp} environments={environments} />}
          </>
        )}
      </div>
    </div>
  );
}
