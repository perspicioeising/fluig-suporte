"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Square, Stethoscope, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/modules/assistant/components/markdown";
import { SourcesList } from "@/modules/assistant/components/sources-list";
import { deleteDiagnostic } from "../actions";
import { useDiagnoseStream } from "../use-diagnose";
import { CATEGORY_LABELS, type Category } from "../signals";
import { CATEGORIES, type DiagnosticRecord, type DiagnosticSummary, type HistoryOption } from "../types";

const fieldClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

function describeHistory(h: HistoryOption) {
  const status = h.status_code ?? "sem resposta";
  const path = (() => {
    try {
      const u = new URL(h.url.split(" :: ")[0]);
      return `${u.pathname}${h.url.includes(" :: ") ? ` :: ${h.url.split(" :: ")[1]}` : ""}`;
    } catch {
      return h.url;
    }
  })();
  const when = new Date(h.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `[${h.kind === "soap" ? "SOAP" : "REST"}] ${h.method} ${path.slice(0, 60)} → ${status} · ${when}`;
}

export function DiagnosticWorkspace({
  environments,
  historyOptions,
  diagnostics: initialDiagnostics,
  initialText,
  initialHistoryId,
  saved,
}: {
  environments: { id: string; name: string }[];
  historyOptions: HistoryOption[];
  diagnostics: DiagnosticSummary[];
  initialText: string;
  initialHistoryId: string | null;
  saved: DiagnosticRecord | null;
}) {
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [errorText, setErrorText] = useState(saved?.input_text ?? initialText);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("auto");
  const [environmentId, setEnvironmentId] = useState("");
  const [historyId, setHistoryId] = useState(initialHistoryId ?? "");

  const { running, error, result, run: runStream, stop } = useDiagnoseStream((id) => {
    setDiagnostics((prev) => [
      { id, category: null, created_at: new Date().toISOString(), preview: errorText.replace(/\s+/g, " ").slice(0, 90) },
      ...prev,
    ]);
    window.history.replaceState(null, "", `/diagnostico?d=${id}`);
  });

  // Diagnóstico aberto a partir da lista (salvo): mostra o resultado gravado sem reexecutar.
  const savedResult = saved
    ? { markdown: saved.markdown, signals: saved.signals, sources: saved.sources, redactions: saved.redactions, attached: [], category: saved.category }
    : null;
  const shown = result ?? savedResult;
  const viewingSaved = Boolean(saved) && !running && !result;

  function run() {
    void runStream({ errorText, category, environmentId: environmentId || undefined, historyId: historyId || undefined });
  }

  return (
    <div className="grid gap-4 @2xl/main:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Diagnósticos anteriores" className="space-y-2 rounded-lg border border-border bg-surface p-3 @2xl/main:max-h-[calc(100vh-12rem)] @2xl/main:overflow-auto">
        <Link
          href="/diagnostico"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
        >
          <Stethoscope className="size-4 text-accent" aria-hidden />
          Novo diagnóstico
        </Link>
        {diagnostics.length === 0 ? (
          <p className="px-1 text-xs text-muted">Nenhum diagnóstico ainda.</p>
        ) : (
          <ul>
            {diagnostics.map((d) => (
              <li key={d.id} className="group flex items-center gap-1">
                <Link
                  href={`/diagnostico?d=${d.id}`}
                  aria-current={saved?.id === d.id ? "page" : undefined}
                  className={cn("min-w-0 flex-1 rounded px-2 py-1.5 hover:bg-surface-2", saved?.id === d.id && "bg-surface-2")}
                >
                  <span className="block truncate text-sm">{d.preview || "Sem texto"}</span>
                  <span className="text-[11px] text-muted">
                    {new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Link>
                <form
                  action={async (formData) => {
                    await deleteDiagnostic(formData);
                    setDiagnostics((prev) => prev.filter((x) => x.id !== d.id));
                  }}
                >
                  <input type="hidden" name="id" value={d.id} />
                  <button
                    type="submit"
                    aria-label="Excluir diagnóstico"
                    className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-w-0 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <div className="space-y-1">
            <label htmlFor="diag-text" className="text-sm font-medium">
              Erro ou log da integração
            </label>
            <textarea
              id="diag-text"
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              readOnly={viewingSaved}
              rows={9}
              maxLength={20000}
              spellCheck={false}
              placeholder={"Cole aqui a mensagem de erro, o corpo da resposta, o SOAP Fault ou o stack trace.\nEx.: HTTP 403 Forbidden ao chamar GET /content-management/api/v2/..."}
              className={cn(fieldClass, "font-mono text-xs")}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-success" aria-hidden />
              Senhas, tokens, assinaturas OAuth, cookies e cabeçalhos Authorization são ocultados no servidor antes da análise.
            </p>
          </div>

          <div className="grid gap-3 @xl/main:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="diag-category" className="text-xs font-medium">Tipo de problema</label>
              <select id="diag-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])} disabled={viewingSaved} className={fieldClass}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c as Category]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="diag-env" className="text-xs font-medium">Ambiente (opcional)</label>
              <select id="diag-env" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} disabled={viewingSaved} className={fieldClass}>
                <option value="">Não informar</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="diag-history" className="text-xs font-medium">Anexar requisição do histórico</label>
              <select id="diag-history" value={historyId} onChange={(e) => setHistoryId(e.target.value)} disabled={viewingSaved} className={fieldClass}>
                <option value="">Nenhuma</option>
                {historyOptions.map((h) => (
                  <option key={h.id} value={h.id}>{describeHistory(h)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {running ? (
              <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2">
                <Square className="size-4" aria-hidden />
                Parar
              </button>
            ) : viewingSaved ? (
              <Link href="/diagnostico" className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
                <Stethoscope className="size-4" aria-hidden />
                Novo diagnóstico
              </Link>
            ) : (
              <button
                type="submit"
                disabled={errorText.trim().length < 10}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Stethoscope className="size-4" aria-hidden />
                Diagnosticar
              </button>
            )}
            {running && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
          </div>
        </form>

        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        {shown && (
          <section aria-label="Resultado do diagnóstico" aria-live="polite" aria-busy={running} className="space-y-3 rounded-lg border border-border bg-surface p-4">
            {(shown.signals.length > 0 || shown.redactions > 0 || shown.attached.length > 0) && (
              <div className="space-y-2 border-b border-border pb-3">
                {shown.signals.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Sinais detectados:</span>
                    {shown.signals.map((s) => (
                      <span key={s.id} className="rounded border border-border bg-surface-2 px-2 py-0.5 text-xs" title={s.evidence}>
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
                {shown.attached.length > 0 && (
                  <p className="text-xs text-muted">Evidências anexadas: {shown.attached.join("; ")}.</p>
                )}
                {shown.redactions > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {shown.redactions} valor{shown.redactions > 1 ? "es" : ""} sensíve{shown.redactions > 1 ? "is" : "l"} ocultado{shown.redactions > 1 ? "s" : ""} antes da análise.
                  </p>
                )}
              </div>
            )}

            {shown.markdown ? (
              <Markdown text={shown.markdown} sources={shown.sources} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Analisando as evidências e consultando a documentação...
              </p>
            )}

            {!running && <SourcesList sources={shown.sources} />}
            <p className="text-xs text-muted">
              Este diagnóstico é um apoio à investigação e pode errar. Confirme as causas antes de alterar um ambiente.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
