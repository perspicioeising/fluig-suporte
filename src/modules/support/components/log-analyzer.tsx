"use client";

import { useRef, useState } from "react";
import { LoaderCircle, ScrollText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeLogFile, type AnalysisResult, type Progress } from "../stream-reader";
import { formatBytes } from "../format";
import { LogResults } from "./log-results";

type Phase = "idle" | "reading" | "done" | "error";

/**
 * Analisador de server.log. O arquivo é lido NO NAVEGADOR em streaming (nunca é enviado
 * ao servidor), então suporta arquivos muito grandes sem estourar memória.
 */
export function LogAnalyzer({
  onResult,
  initialResult = null,
}: {
  onResult?: (r: AnalysisResult | null) => void;
  /** Resultado restaurado (sessionStorage) para reexibir ao voltar à tela. */
  initialResult?: AnalysisResult | null;
} = {}) {
  const [phase, setPhase] = useState<Phase>(initialResult ? "done" : "idle");
  const [progress, setProgress] = useState<Progress>({ bytesRead: 0, total: 0 });
  const [result, setResult] = useState<AnalysisResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    setPhase("reading");
    setResult(null);
    setError(null);
    setProgress({ bytesRead: 0, total: file.size });
    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = performance.now();
    try {
      const res = await analyzeLogFile(file, (p) => setProgress(p), controller.signal);
      setElapsed(performance.now() - t0);
      setResult(res);
      onResult?.(res);
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("idle");
      } else {
        setError("Não foi possível ler o arquivo. Verifique se é um server.log de texto.");
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) void run(file);
  }

  const pct = progress.total ? Math.round((progress.bytesRead / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed border-border bg-surface p-6 text-center transition-colors",
          dragging && "border-accent bg-surface-2",
        )}
      >
        <ScrollText className="mx-auto size-8 text-accent" aria-hidden />
        <p className="mt-2 text-sm font-medium">Arraste o server.log aqui ou selecione o arquivo</p>
        <p className="mt-1 text-xs text-muted">
          Lido no seu navegador, em streaming — o arquivo <strong>não é enviado</strong> a nenhum servidor. Suporta
          arquivos grandes (vários GB).
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={phase === "reading"}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Upload className="size-4" aria-hidden />
          Selecionar arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,text/plain"
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {/* Progresso */}
      {phase === "reading" && (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
              Analisando... {formatBytes(progress.bytesRead)} de {formatBytes(progress.total)}
            </span>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
            >
              <X className="size-3.5" aria-hidden />
              Cancelar
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-right text-xs text-muted tabular-nums">{pct}%</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {phase === "done" && result && (
        <>
          <p className="text-xs text-muted">
            {elapsed > 0 ? `Analisado em ${(elapsed / 1000).toFixed(1)}s. ` : "Análise anterior restaurada. "}
            <button type="button" onClick={() => inputRef.current?.click()} className="text-accent hover:underline">
              Analisar outro arquivo
            </button>
          </p>
          <LogResults result={result} />
        </>
      )}
    </div>
  );
}
