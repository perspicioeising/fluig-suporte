"use client";

import { useState } from "react";
import { ScrollText, Settings2, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "../stream-reader";
import type { ParsedConfig } from "../config-parser";
import type { ConfigIssue } from "../config-validation";
import { LogAnalyzer } from "./log-analyzer";
import { ConfigValidator } from "./config-validator";
import { SupportDiagnosis } from "./support-diagnosis";

type Tab = "logs" | "config" | "diag";
type ConfigAnalyzed = { fileName: string; parsed: ParsedConfig; issues: ConfigIssue[] };

/** Hub de análise para o suporte: logs, configurações e diagnóstico (correlação + IA). */
export function SupportTabs() {
  const [tab, setTab] = useState<Tab>("logs");
  const [logResult, setLogResult] = useState<AnalysisResult | null>(null);
  const [configs, setConfigs] = useState<ConfigAnalyzed[]>([]);

  // Sinaliza na aba Diagnóstico quantas evidências já existem.
  const evidenceCount = (logResult ? 1 : 0) + (configs.length > 0 ? 1 : 0);

  const tabs: { id: Tab; label: string; icon: typeof ScrollText; badge?: number }[] = [
    { id: "logs", label: "Logs (server.log)", icon: ScrollText },
    { id: "config", label: "Configurações", icon: Settings2 },
    { id: "diag", label: "Diagnóstico", icon: Stethoscope, badge: evidenceCount || undefined },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Tipo de análise" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
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
            {badge ? (
              <span className="rounded-full bg-accent/20 px-1.5 text-[11px] font-medium text-accent">{badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Mantém montado para não perder a análise já feita ao alternar. */}
      <div hidden={tab !== "logs"}>
        <LogAnalyzer onResult={setLogResult} />
      </div>
      <div hidden={tab !== "config"}>
        <ConfigValidator onResults={setConfigs} />
      </div>
      <div hidden={tab !== "diag"}>
        <SupportDiagnosis logResult={logResult} configs={configs} />
      </div>
    </div>
  );
}
