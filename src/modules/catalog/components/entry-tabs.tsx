"use client";

import { useState } from "react";
import { BookText, Code2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import type { BuilderEntry } from "@/modules/builder/types";
import { BuilderPanel } from "@/modules/builder/components/builder-panel";
import { InlineTester } from "@/modules/tester/components/inline-tester";

type TabId = "doc" | "test" | "code";

/**
 * Hub da entrada do catálogo: documentação, teste e código no MESMO lugar.
 * "doc" é renderizada no servidor e passada como children; "test" e "code"
 * são interativas. A aba Testar só existe para REST (o SOAP tem laboratório próprio).
 */
export function EntryTabs({
  builderEntry,
  environments,
  children,
}: {
  builderEntry: BuilderEntry;
  environments: EnvironmentSummary[];
  children: React.ReactNode;
}) {
  const { entry, parameters } = builderEntry;
  const isRest = entry.kind === "rest_new" || entry.kind === "rest_old";
  const canTest = isRest && Boolean(entry.path && entry.http_method);

  const [tab, setTab] = useState<TabId>("doc");

  const tabs: { id: TabId; label: string; icon: typeof BookText }[] = [
    { id: "doc", label: "Documentação", icon: BookText },
    ...(canTest ? [{ id: "test" as const, label: "Testar", icon: Send }] : []),
    { id: "code", label: "Código", icon: Code2 },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Documentação, teste e código" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-foreground",
              tab === id && "border-b-2 border-accent font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Mantém a doc montada (é conteúdo do servidor) e só esconde, para não perder nada ao alternar. */}
      <div hidden={tab !== "doc"}>{children}</div>

      {canTest && tab === "test" && (
        <InlineTester entry={entry} parameters={parameters} environments={environments} />
      )}

      {tab === "code" && (
        <BuilderPanel
          data={builderEntry}
          environments={environments.filter((e) => e.is_active).map((e) => ({ id: e.id, name: e.name, base_url: e.base_url }))}
          showCatalogLink={false}
        />
      )}
    </div>
  );
}
