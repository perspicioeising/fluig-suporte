"use client";

import { useState } from "react";
import { ScrollText, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogAnalyzer } from "./log-analyzer";
import { ConfigValidator } from "./config-validator";

type Tab = "logs" | "config";

/** Hub de análise para o suporte: logs (server.log) e configurações, no mesmo lugar. */
export function SupportTabs() {
  const [tab, setTab] = useState<Tab>("logs");
  const tabs: { id: Tab; label: string; icon: typeof ScrollText }[] = [
    { id: "logs", label: "Logs (server.log)", icon: ScrollText },
    { id: "config", label: "Configurações", icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Tipo de análise" className="flex flex-wrap gap-1 border-b border-border">
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

      {/* Mantém os dois montados para não perder a análise já feita ao alternar. */}
      <div hidden={tab !== "logs"}>
        <LogAnalyzer />
      </div>
      <div hidden={tab !== "config"}>
        <ConfigValidator />
      </div>
    </div>
  );
}
