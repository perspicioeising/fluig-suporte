"use client";

import { useState } from "react";
import { BookText, Code2, PanelRightClose, PanelRightOpen, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import type { BuilderEntry } from "@/modules/builder/types";
import { BuilderPanel } from "@/modules/builder/components/builder-panel";
import { InlineTester } from "@/modules/tester/components/inline-tester";
import { InlineSoapTester } from "@/modules/soap/components/inline-soap-tester";
import { EntryAssist, type AssistTab } from "./entry-assist";

type TabId = "doc" | "test" | "code";

/**
 * Detalhe da API em duas colunas:
 * - esquerda: a API (abas Documentação / Testar / Código);
 * - direita: assistência contextual (Assistente / Diagnóstico), recolhível.
 * Um erro na aba Testar abre o painel direito já no Diagnóstico, com o resumo preenchido.
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
  const isSoap = entry.kind === "soap";
  // REST: precisa de caminho+método. SOAP: a aba sempre aparece (orienta a importar o WSDL se faltar).
  const canTest = (isRest && Boolean(entry.path && entry.http_method)) || isSoap;
  const activeEnvs = environments.filter((e) => e.is_active);

  const [tab, setTab] = useState<TabId>("doc");
  const [assistOpen, setAssistOpen] = useState(true);
  const [assistTab, setAssistTab] = useState<AssistTab>("chat");
  const [testerEnvId, setTesterEnvId] = useState(activeEnvs[0]?.id ?? "");
  const [diagSeed, setDiagSeed] = useState<{ text: string; key: number }>({ text: "", key: 0 });

  const suggestions = buildSuggestions(entry.name, entry.kind);

  const leftTabs: { id: TabId; label: string; icon: typeof BookText }[] = [
    { id: "doc", label: "Documentação", icon: BookText },
    ...(canTest ? [{ id: "test" as const, label: "Testar", icon: Send }] : []),
    { id: "code", label: "Código", icon: Code2 },
  ];

  function handleDiagnose(summary: string, environmentId: string) {
    setDiagSeed((s) => ({ text: summary, key: s.key + 1 }));
    setTesterEnvId(environmentId || testerEnvId);
    setAssistTab("diag");
    setAssistOpen(true);
  }

  return (
    <div className={cn("grid gap-4", assistOpen && "@5xl/main:grid-cols-[minmax(0,1fr)_26rem]")}>
      {/* Coluna da API */}
      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-border">
          <div role="tablist" aria-label="Documentação, teste e código" className="flex flex-wrap gap-1">
            {leftTabs.map(({ id, label, icon: Icon }) => (
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
          {!assistOpen && (
            <button
              type="button"
              onClick={() => setAssistOpen(true)}
              className="mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <PanelRightOpen className="size-4 text-accent" aria-hidden />
              Assistente
            </button>
          )}
        </div>

        <div hidden={tab !== "doc"}>{children}</div>

        {tab === "test" && isRest && (
          <InlineTester
            entry={entry}
            parameters={parameters}
            environments={environments}
            onDiagnose={handleDiagnose}
          />
        )}

        {tab === "test" && isSoap && (
          <InlineSoapTester
            op={builderEntry.soapOperation}
            wsdlId={builderEntry.soapWsdlId}
            serviceName={entry.name.includes(".") ? entry.name.split(".")[0] : entry.name}
            environments={environments}
            onDiagnose={handleDiagnose}
          />
        )}

        {tab === "code" && (
          <BuilderPanel
            data={builderEntry}
            environments={activeEnvs.map((e) => ({ id: e.id, name: e.name, base_url: e.base_url }))}
            showCatalogLink={false}
          />
        )}
      </div>

      {/* Coluna de assistência */}
      {assistOpen && (
        <aside className="min-w-0 @5xl/main:sticky @5xl/main:top-20 @5xl/main:self-start">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setAssistOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <PanelRightClose className="size-4" aria-hidden />
              Ocultar
            </button>
          </div>
          <EntryAssist
            tab={assistTab}
            onTab={setAssistTab}
            suggestions={suggestions}
            environmentId={testerEnvId || undefined}
            diagSeedText={diagSeed.key > 0 ? diagSeed.text : undefined}
            diagSeedKey={diagSeed.key}
          />
        </aside>
      )}
    </div>
  );
}

/** Sugestões de pergunta já contextualizadas na API aberta. */
function buildSuggestions(name: string, kind: string): string[] {
  const base = [`Como uso ${name}? Mostre um exemplo citando a documentação.`];
  if (kind === "rest_new" || kind === "rest_old") {
    base.push(`Quais são os parâmetros obrigatórios de ${name}?`);
    base.push(`Como autenticar esta chamada REST no Fluig?`);
  } else if (kind === "soap") {
    base.push(`Quais argumentos ${name} espera e o que retorna?`);
  } else {
    base.push(`Em que evento/contexto posso usar ${name}?`);
  }
  return base;
}
