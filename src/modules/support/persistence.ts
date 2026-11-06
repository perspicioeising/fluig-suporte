"use client";

import type { AnalysisResult } from "./stream-reader";
import type { ParsedConfig } from "./config-parser";
import type { ConfigIssue } from "./config-validation";

/**
 * Persistência leve da análise de suporte no sessionStorage (dura enquanto a aba vive).
 *
 * Por que sessionStorage e não banco/localStorage:
 *  - Dados de log são sensíveis: faz sentido sumirem ao fechar a aba, não ficarem no disco.
 *  - Zero custo de servidor; resolve o "saí da tela e perdi tudo" ao navegar entre rotas.
 *  - Histórico permanente (reabrir análises antigas) é outra feature (Supabase), à parte.
 *
 * O log BRUTO nunca é salvo — só o resultado agregado. Para caber no limite (~5 MB) do
 * sessionStorage, os stack traces dos erros retidos são truncados ao persistir (a busca por
 * mensagem continua funcionando; o stack trace completo se perde ao recarregar a página).
 */

export type ConfigAnalyzed = { fileName: string; parsed: ParsedConfig; issues: ConfigIssue[] };

type PersistedState = {
  version: 1;
  logResult: AnalysisResult | null;
  configs: ConfigAnalyzed[];
};

const KEY = "fluig.support.analysis.v1";
const MAX_DETAIL_CHARS = 400; // trunca stack trace ao persistir para não estourar o storage

function shrink(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    keptErrorEvents: result.keptErrorEvents.map((e) =>
      e.detail && e.detail.length > MAX_DETAIL_CHARS
        ? { ...e, detail: e.detail.slice(0, MAX_DETAIL_CHARS) + "\n… (truncado ao salvar; recarregue o arquivo para o stack trace completo)" }
        : e,
    ),
  };
}

/** Salva o estado atual. Silencioso em caso de falha (quota, modo privado). */
export function saveAnalysis(logResult: AnalysisResult | null, configs: ConfigAnalyzed[]): void {
  if (typeof window === "undefined") return;
  // Nada a salvar: limpa para não reter lixo.
  if (!logResult && configs.length === 0) {
    clearAnalysis();
    return;
  }
  const state: PersistedState = {
    version: 1,
    logResult: logResult ? shrink(logResult) : null,
    configs,
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota excedida ou storage indisponível: desiste sem quebrar a tela
  }
}

/** Restaura o estado salvo nesta aba, ou null se não houver / estiver inválido. */
export function loadAnalysis(): { logResult: AnalysisResult | null; configs: ConfigAnalyzed[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1) return null;
    return { logResult: parsed.logResult ?? null, configs: parsed.configs ?? [] };
  } catch {
    return null;
  }
}

/** Remove o estado salvo (ex.: ao limpar a análise). */
export function clearAnalysis(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
