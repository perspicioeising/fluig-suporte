"use client";

import { useEffect, useState } from "react";
import { ScrollText, Settings2, Stethoscope, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "../stream-reader";
import { clearAnalysis, loadAnalysis, saveAnalysis, type ConfigAnalyzed } from "../persistence";
import { LogAnalyzer } from "./log-analyzer";
import { ConfigValidator } from "./config-validator";
import { SupportDiagnosis } from "./support-diagnosis";

type Tab = "logs" | "config" | "diag";

/** Hub de análise para o suporte: logs, configurações e diagnóstico (correlação + IA). */
export function SupportTabs() {
  const [tab, setTab] = useState<Tab>("logs");
  // Estado inicial lazy: restaura a análise salva nesta aba (sessionStorage), se houver.
  const restored = useState(() => loadAnalysis())[0];
  const [logResult, setLogResult] = useState<AnalysisResult | null>(restored?.logResult ?? null);
  const [configs, setConfigs] = useState<ConfigAnalyzed[]>(restored?.configs ?? []);
  // Muda ao limpar para remontar os filhos (que têm estado interno de upload/resultado).
  const [epoch, setEpoch] = useState(0);

  // Persiste a análise ao mudar, para não perder ao navegar para outra rota e voltar.
  useEffect(() => {
    saveAnalysis(logResult, configs);
  }, [logResult, configs]);

  function clearAll() {
    setLogResult(null);
    setConfigs([]);
    clearAnalysis();
    setEpoch((n) => n + 1);
  }

  const hasData = !!logResult || configs.length > 0;

  // Sinaliza na aba Diagnóstico quantas evidências já existem.
  const evidenceCount = (logResult ? 1 : 0) + (configs.length > 0 ? 1 : 0);

  const tabs: { id: Tab; label: string; icon: typeof ScrollText; badge?: number }[] = [
    { id: "logs", label: "Logs (server.log)", icon: ScrollText },
    { id: "config", label: "Configurações", icon: Settings2 },
    { id: "diag", label: "Diagnóstico", icon: Stethoscope, badge: evidenceCount || undefined },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div role="tablist" aria-label="Tipo de análise" className="flex flex-wrap gap-1">
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
        {hasData && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted hover:text-danger"
            title="Descarta a análise atual desta aba"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Limpar análise
          </button>
        )}
      </div>

      {/* Mantém montado para não perder a análise já feita ao alternar. */}
      <div hidden={tab !== "logs"}>
        <LogAnalyzer key={`log-${epoch}`} onResult={setLogResult} initialResult={restored?.logResult ?? null} />
      </div>
      <div hidden={tab !== "config"}>
        <ConfigValidator key={`cfg-${epoch}`} onResults={setConfigs} initialFiles={restored?.configs ?? []} />
      </div>
      <div hidden={tab !== "diag"}>
        <SupportDiagnosis logResult={logResult} configs={configs} />
      </div>
    </div>
  );
}
