"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Snippet } from "../types";

export function SnippetView({ snippets }: { snippets: Snippet[] }) {
  const [activeId, setActiveId] = useState(snippets[0]?.id);
  const [copied, setCopied] = useState(false);

  const active = snippets.find((s) => s.id === activeId) ?? snippets[0];
  if (!active) {
    return <p className="text-sm text-muted">Nenhum exemplo disponível para esta entrada.</p>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível
    }
  }

  return (
    <section aria-label="Código gerado" className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Linguagem" className="flex flex-wrap gap-1 border-b border-border">
          {snippets.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === active.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "px-3 py-1.5 text-sm text-muted hover:text-foreground",
                s.id === active.id && "border-b-2 border-accent text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {active.notes && active.notes.length > 0 && (
        <ul className="space-y-1 rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
          {active.notes.map((note, i) => (
            <li key={i}>• {note}</li>
          ))}
        </ul>
      )}

      <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs whitespace-pre">
        <code>{active.code}</code>
      </pre>
    </section>
  );
}
