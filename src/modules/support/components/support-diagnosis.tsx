"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, FileText, Loader2, ShieldCheck, Square, Stethoscope } from "lucide-react";
import { Markdown } from "@/modules/assistant/components/markdown";
import { SourcesList } from "@/modules/assistant/components/sources-list";
import { useDiagnoseStream } from "@/modules/diagnostics/use-diagnose";
import type { AnalysisResult } from "../stream-reader";
import type { ParsedConfig } from "../config-parser";
import type { ConfigIssue } from "../config-validation";
import { correlate } from "../correlation";
import { buildEvidenceText, hasEvidence } from "../evidence";
import { buildReport } from "../report";

type ConfigAnalyzed = { fileName: string; parsed: ParsedConfig; issues: ConfigIssue[] };

/**
 * Aba Diagnóstico do suporte: reúne os achados do log e das configs, mostra as correlações
 * e dispara o diagnóstico com IA sobre o pacote de evidências (rota /api/diagnostics/analyze).
 * Reaproveita o motor de diagnóstico; segredos são redigidos no servidor.
 */
export function SupportDiagnosis({
  logResult,
  configs,
}: {
  logResult: AnalysisResult | null;
  configs: ConfigAnalyzed[];
}) {
  const correlations = useMemo(
    () => (logResult ? correlate(logResult.findings, configs.map((c) => c.parsed), configs.flatMap((c) => c.issues)) : []),
    [logResult, configs],
  );
  const pkg = useMemo(() => ({ logAnalysis: logResult, configs, correlations }), [logResult, configs, correlations]);
  const evidenceReady = hasEvidence(pkg);

  const { running, error, result, run, stop } = useDiagnoseStream();
  const [started, setStarted] = useState(false);

  function diagnose() {
    const errorText = buildEvidenceText(pkg);
    if (errorText.trim().length < 10) return;
    setStarted(true);
    void run({ errorText, category: "auto" });
  }

  if (!logResult && configs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
        Analise um <strong>server.log</strong> na aba Logs e/ou valide arquivos de configuração na aba Configurações.
        As evidências aparecem aqui para correlação e diagnóstico com IA.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Correlações */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Correlações log × configuração</h2>
        {correlations.length === 0 ? (
          <p className="text-sm text-muted">
            {logResult && configs.length > 0
              ? "Nenhuma correlação automática entre os achados do log e as configurações enviadas."
              : "Para correlacionar, tenha um log analisado e ao menos um arquivo de configuração enviado."}
          </p>
        ) : (
          <ul className="space-y-2">
            {correlations.map((c) => (
              <li key={c.logIssueId} className="rounded-md border border-border bg-surface-2 p-3">
                <p className="text-sm font-medium">{c.title}</p>
                <p className="mt-1 text-sm text-muted">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Diagnóstico com IA */}
      <section aria-label="Diagnóstico com IA" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Diagnóstico com IA</h2>
          {running ? (
            <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
              <Square className="size-4" aria-hidden />
              Parar
            </button>
          ) : (
            <button
              type="button"
              onClick={diagnose}
              disabled={!evidenceReady}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              title={evidenceReady ? undefined : "Analise um log com erros ou envie uma configuração com achados primeiro."}
            >
              <Stethoscope className="size-4" aria-hidden />
              {started ? "Diagnosticar de novo" : "Diagnosticar com IA"}
            </button>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
          Enviamos apenas um resumo das evidências (ambiente, erros agrupados, achados de configuração e correlações),
          não o arquivo inteiro. Senhas e tokens são ocultados no servidor antes da análise.
        </p>

        {!evidenceReady && (
          <p className="text-xs text-muted">
            Ainda não há evidências suficientes. Analise um log com erros ou envie uma configuração com achados.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
        )}

        {result && (
          <div aria-live="polite" aria-busy={running} className="space-y-3 border-t border-border pt-3">
            {(result.signals.length > 0 || result.redactions > 0) && (
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
                {result.redactions > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {result.redactions} valor{result.redactions > 1 ? "es" : ""} sensíve{result.redactions > 1 ? "is" : "l"} ocultado{result.redactions > 1 ? "s" : ""} antes da análise.
                  </p>
                )}
              </div>
            )}
            {result.markdown ? (
              <Markdown text={result.markdown} sources={result.sources} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Analisando as evidências e consultando a documentação...
              </p>
            )}
            {!running && <SourcesList sources={result.sources} />}
            <p className="text-xs text-muted">
              Apoio à investigação; pode errar. Confirme as causas antes de alterar um ambiente.
            </p>
          </div>
        )}
      </section>

      {/* Relatório técnico para copiar (disponível assim que há evidências) */}
      {evidenceReady && !running && (
        <ReportCard
          markdown={buildReport({
            pkg,
            diagnosisMarkdown: result?.markdown ?? null,
            diagnosisSources: result?.sources ?? [],
          })}
        />
      )}
    </div>
  );
}

function ReportCard({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    let done = false;
    try {
      await navigator.clipboard.writeText(markdown);
      done = true;
    } catch {
      // Fallback: seleciona o textarea e usa execCommand (navegadores sem permissão de clipboard).
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          done = document.execCommand("copy");
        } catch {
          done = false;
        }
      }
    }
    if (done) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section aria-label="Relatório técnico" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-accent" aria-hidden />
          Relatório técnico
        </h2>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Resumo pronto para colar no atendimento: ambiente, achados do log, configurações, correlações e o diagnóstico.
        Sem log bruto nem credenciais.
      </p>
      <textarea
        ref={textareaRef}
        readOnly
        value={markdown}
        rows={16}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-md border border-border bg-surface-2 p-3 font-mono text-xs"
      />
    </section>
  );
}
