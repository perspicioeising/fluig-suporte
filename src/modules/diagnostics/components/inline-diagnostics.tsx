"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Square, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/modules/assistant/components/markdown";
import { SourcesList } from "@/modules/assistant/components/sources-list";
import { useDiagnoseStream } from "../use-diagnose";

const fieldClass = "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

/**
 * Diagnóstico embutido (painel lateral do catálogo). Sem a lista de diagnósticos anteriores.
 * `seedText` é preenchido quando um teste na aba Testar falha, já com o ambiente da API.
 */
export function InlineDiagnostics({
  environmentId,
  seedText,
  seedKey,
}: {
  environmentId?: string;
  /** Texto inicial (ex.: resumo do erro do último teste). */
  seedText?: string;
  /** Muda quando um novo erro é enviado, para re-popular o campo. */
  seedKey?: number;
}) {
  const [errorText, setErrorText] = useState(seedText ?? "");
  const { running, error, result, run, stop } = useDiagnoseStream();

  // Quando a aba Testar manda um novo erro, seedKey muda: repõe o texto ajustando o estado
  // durante o render (padrão suportado pelo React, sem efeito que chama setState).
  const [seenSeed, setSeenSeed] = useState(seedKey);
  if (seedKey !== seenSeed) {
    setSeenSeed(seedKey);
    if (seedText !== undefined) setErrorText(seedText);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (errorText.trim().length >= 10) void run({ errorText, category: "auto", environmentId });
        }}
        className="space-y-2 p-3"
      >
        <label htmlFor="inline-diag-text" className="text-xs font-medium">
          Erro ou log da integração
        </label>
        <textarea
          id="inline-diag-text"
          value={errorText}
          onChange={(e) => setErrorText(e.target.value)}
          rows={6}
          maxLength={20000}
          spellCheck={false}
          placeholder={"Cole o erro, o corpo da resposta, o SOAP Fault ou o stack trace.\nOu execute na aba Testar e use \u201cDiagnosticar este erro\u201d."}
          className={cn(fieldClass, "font-mono text-xs")}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
          Senhas, tokens e cabeçalhos sensíveis são ocultados no servidor antes da análise.
        </p>
        <div className="flex items-center gap-2">
          {running ? (
            <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
              <Square className="size-4" aria-hidden />
              Parar
            </button>
          ) : (
            <button
              type="submit"
              disabled={errorText.trim().length < 10}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Stethoscope className="size-4" aria-hidden />
              Diagnosticar
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="mx-3 mb-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      {result && (
        <section aria-label="Resultado do diagnóstico" aria-live="polite" aria-busy={running} className="space-y-3 border-t border-border p-3">
          {(result.signals.length > 0 || result.redactions > 0 || result.attached.length > 0) && (
            <div className="space-y-2 border-b border-border pb-3">
              {result.signals.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">Sinais:</span>
                  {result.signals.map((s) => (
                    <span key={s.id} className="rounded border border-border bg-surface-2 px-2 py-0.5 text-xs" title={s.evidence}>
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
              {result.attached.length > 0 && <p className="text-xs text-muted">Evidências: {result.attached.join("; ")}.</p>}
              {result.redactions > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {result.redactions} valor{result.redactions > 1 ? "es" : ""} sensíve{result.redactions > 1 ? "is" : "l"} ocultado{result.redactions > 1 ? "s" : ""}.
                </p>
              )}
            </div>
          )}
          {result.markdown ? (
            <Markdown text={result.markdown} sources={result.sources} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Analisando as evidências...
            </p>
          )}
          {!running && <SourcesList sources={result.sources} />}
          <p className="text-xs text-muted">
            Apoio à investigação; pode errar. Para anexar uma requisição do histórico, use a{" "}
            <Link href="/diagnostico" className="text-accent hover:underline">tela de Diagnóstico</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
