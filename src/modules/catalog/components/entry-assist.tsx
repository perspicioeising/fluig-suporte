"use client";

import { Sparkles, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineAssistant } from "@/modules/assistant/components/inline-assistant";
import { InlineDiagnostics } from "@/modules/diagnostics/components/inline-diagnostics";

export type AssistTab = "chat" | "diag";

/**
 * Painel de assistência do detalhe da API (coluna da direita): Chat e Diagnóstico,
 * já cientes da API aberta. O Diagnóstico pode ser semeado por um erro vindo da aba Testar.
 */
export function EntryAssist({
  tab,
  onTab,
  suggestions,
  environmentId,
  diagSeedText,
  diagSeedKey,
}: {
  tab: AssistTab;
  onTab: (t: AssistTab) => void;
  suggestions: string[];
  environmentId?: string;
  diagSeedText?: string;
  diagSeedKey?: number;
}) {
  const tabs: { id: AssistTab; label: string; icon: typeof Sparkles }[] = [
    { id: "chat", label: "Assistente", icon: Sparkles },
    { id: "diag", label: "Diagnóstico", icon: Stethoscope },
  ];

  return (
    <section
      aria-label="Assistência"
      className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-surface @5xl/main:h-[calc(100dvh-10rem)] @5xl/main:min-h-0"
    >
      <div role="tablist" aria-label="Assistente e diagnóstico" className="flex shrink-0 gap-1 border-b border-border px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted hover:text-foreground",
              tab === id && "border-b-2 border-accent font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Mantém os dois montados (preserva conversa/resultado ao alternar); só esconde o inativo. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "chat" && "hidden")}>
        <InlineAssistant suggestions={suggestions} />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "diag" && "hidden")}>
        <InlineDiagnostics environmentId={environmentId} seedText={diagSeedText} seedKey={diagSeedKey} />
      </div>
    </section>
  );
}
