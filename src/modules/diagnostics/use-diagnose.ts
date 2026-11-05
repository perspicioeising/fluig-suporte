"use client";

import { useCallback, useRef, useState } from "react";
import type { Source } from "@/modules/assistant/types";
import type { Category, Signal } from "./signals";
import type { DiagnosticEvent } from "./types";

export type DiagnosticResult = {
  markdown: string;
  signals: Signal[];
  sources: Source[];
  redactions: number;
  attached: string[];
  category?: string | null;
};

export type DiagnoseArgs = {
  errorText: string;
  category: Category;
  environmentId?: string;
  historyId?: string;
};

/**
 * Consome o stream NDJSON de /api/diagnostics/analyze. Compartilhado entre a tela de
 * Diagnóstico e o painel embutido no catálogo. `onCreated` recebe o id gravado.
 */
export function useDiagnoseStream(onCreated?: (id: string) => void) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);
  const setSaved = useCallback((r: DiagnosticResult) => setResult(r), []);

  const run = useCallback(
    async (args: DiagnoseArgs) => {
      if (running) return;
      setError(null);
      setRunning(true);
      setResult({ markdown: "", signals: [], sources: [], redactions: 0, attached: [] });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/diagnostics/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            errorText: args.errorText,
            category: args.category,
            environmentId: args.environmentId || undefined,
            historyId: args.historyId || undefined,
          }),
          signal: controller.signal,
        });

        const type = res.headers.get("content-type") ?? "";
        if (res.redirected || (!res.ok && !type.includes("json"))) {
          setError("Sessão expirada. Recarregue a página e entre novamente.");
          setResult(null);
          return;
        }
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Não foi possível gerar o diagnóstico.");
          setResult(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handle = (event: DiagnosticEvent) => {
          if (event.type === "meta") {
            setResult((r) => ({
              ...(r as DiagnosticResult),
              signals: event.signals,
              sources: event.sources,
              redactions: event.redactions,
              attached: event.attached,
              category: event.category,
            }));
          } else if (event.type === "delta") {
            setResult((r) => ({ ...(r as DiagnosticResult), markdown: (r?.markdown ?? "") + event.text }));
          } else if (event.type === "done") {
            setResult((r) => ({ ...(r as DiagnosticResult), sources: event.sources }));
            if (event.diagnosticId) onCreated?.(event.diagnosticId);
          } else if (event.type === "error") {
            setError(event.message);
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) handle(JSON.parse(line) as DiagnosticEvent);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError("Falha de comunicação com o servidor.");
          setResult((r) => (r && r.markdown ? r : null));
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [running, onCreated],
  );

  return { running, error, result, run, stop, clear, setSaved };
}
