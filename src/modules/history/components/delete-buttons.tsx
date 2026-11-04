"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteFilteredHistory, deleteHistoryItem } from "../actions";
import type { HistoryFilter } from "../schemas";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, message, run };
}

export function DeleteHistoryItemButton({ id, closeHref }: { id: string; closeHref: string }) {
  const router = useRouter();
  const { pending, message, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Excluir este registro do histórico? A ação não pode ser desfeita.")) return;
          run(() => deleteHistoryItem(id), () => router.replace(closeHref, { scroll: false }));
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
        {pending ? "Excluindo..." : "Excluir"}
      </button>
      {message && !message.ok && (
        <span role="alert" className="text-xs text-danger">{message.text}</span>
      )}
    </span>
  );
}

export function DeleteFilteredButton({ filter, filtered }: { filter: HistoryFilter; filtered: boolean }) {
  const { pending, message, run } = useAction();
  const label = filtered ? "Excluir meus registros filtrados" : "Excluir todo o meu histórico";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const text = filtered
            ? "Excluir TODOS os seus registros que correspondem aos filtros atuais (inclusive os de outras páginas)? Registros de outros membros não são afetados. A ação não pode ser desfeita."
            : "Excluir TODO o seu histórico de requisições? Registros de outros membros não são afetados. A ação não pode ser desfeita.";
          if (!window.confirm(text)) return;
          run(() => deleteFilteredHistory(filter));
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
        {pending ? "Excluindo..." : label}
      </button>
      {message && (
        <span role="status" className={message.ok ? "text-xs text-muted" : "text-xs text-danger"}>
          {message.text}
        </span>
      )}
    </span>
  );
}
