"use client";

import { ChunkedLogParser, type LogEvent } from "./log-parser";
import { analyzeEvents, type LogSummary } from "./log-analysis";
import { createIssueAccumulator, type IssueFinding, type SlowOperation } from "./known-issues";

export type AnalysisResult = {
  summary: LogSummary;
  findings: IssueFinding[];
  /** Operações lentas detectadas (JSChronos "executou por N segundos"). */
  slowOperations: SlowOperation[];
  fileName: string;
  fileSize: number;
  /** Eventos retidos para a interface (não todos: ver MAX_KEPT_EVENTS). */
  keptErrorEvents: LogEvent[];
  truncatedEvents: boolean;
};

export type Progress = { bytesRead: number; total: number };

// Mantemos em memória só os eventos de erro/aviso (para exibir detalhe); o resto é agregado.
const MAX_KEPT_EVENTS = 5000;

/**
 * Lê um arquivo de log em pedaços (sem carregar os 5 GB na memória) e produz a análise.
 * O arquivo NUNCA sai do navegador; só o resultado agregado pode ser salvo depois.
 */
export async function analyzeLogFile(
  file: File,
  onProgress?: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const events: LogEvent[] = [];
  const keptErrorEvents: LogEvent[] = [];
  let truncatedEvents = false;
  const issueAccumulator = createIssueAccumulator();

  // Para a timeline e contagens, precisamos de TODOS os eventos agregados — mas não guardamos
  // o texto de todos: guardamos campos leves. Erros/avisos ficam com detalhe para exibição,
  // e a detecção de problemas roda sobre TODOS os erros (é só regex), não só os retidos.
  const parser = new ChunkedLogParser(1, (e) => {
    if (e.level === "ERROR" || e.level === "FATAL" || e.level === "WARN") {
      issueAccumulator.feed(e);
      if (keptErrorEvents.length < MAX_KEPT_EVENTS) keptErrorEvents.push(e);
      else truncatedEvents = true;
    }
    events.push({ ...e, detail: "" }); // leve: só para contagem/timeline/env/assinatura
  });

  const decoder = new TextDecoder("utf-8");
  const reader = file.stream().getReader();
  let bytesRead = 0;

  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Análise cancelada.", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      parser.push(decoder.decode(value, { stream: true }));
      onProgress?.({ bytesRead, total: file.size });
      // cede o controle para o navegador não travar
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    reader.releaseLock();
  }
  parser.finish();

  // A detecção de problemas usa os eventos de erro retidos (com detalhe/stack trace).
  // Para env/timeline/contagem, usa todos (leves).
  const summary = analyzeEvents(events);
  const findings = issueAccumulator.result();
  const slowOperations = issueAccumulator.slowOperations();

  return {
    summary,
    findings,
    slowOperations,
    fileName: file.name,
    fileSize: file.size,
    keptErrorEvents,
    truncatedEvents,
  };
}
