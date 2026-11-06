"use client";

import { Activity, Clock, Gauge, Info, ListTree, Power, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "../stream-reader";
import type { LogLevel } from "../log-parser";
import type { Restart } from "../log-analysis";
import type { Severity } from "../known-issues";
import { SLOW_CHECKS, SLOW_SOLUTION_ID } from "../solutions-types";
import { formatBytes, formatDuration, formatLogTime } from "../format";
import { SolutionLink, useSolutions } from "./solution-link";

const LEVEL_STYLE: Record<LogLevel, string> = {
  FATAL: "text-danger",
  ERROR: "text-danger",
  WARN: "text-accent",
  INFO: "text-muted",
  DEBUG: "text-muted",
  TRACE: "text-muted",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  alta: "border-danger/40 bg-danger/10 text-danger",
  media: "border-accent/40 bg-accent/10 text-accent",
  baixa: "border-border bg-surface-2 text-muted",
};
const SEVERITY_LABEL: Record<Severity, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Info; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-accent" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Mini gráfico de barras da timeline (erros + avisos por janela), sem dependências. */
function Timeline({ result }: { result: AnalysisResult }) {
  const { timeline, bucketMs } = result.summary;
  if (timeline.length === 0) return null;
  const max = Math.max(1, ...timeline.map((b) => b.total));

  return (
    <Card title="Linha do tempo" icon={Activity}>
      <p className="text-xs text-muted">
        Eventos por janela de {formatDuration(bucketMs)}. Vermelho = erros, laranja = avisos. Passe o mouse para detalhes.
      </p>
      <div className="flex h-28 items-end gap-px overflow-hidden rounded-md border border-border bg-surface-2 p-1">
        {timeline.map((b) => {
          const h = (n: number) => `${Math.max(n > 0 ? 6 : 0, (n / max) * 100)}%`;
          const title = `${formatLogTime(b.startEpochMs)} — ${b.total} evento(s): ${b.errors} erro(s), ${b.warns} aviso(s)`;
          return (
            <div key={b.startEpochMs} className="flex h-full min-w-[2px] flex-1 flex-col justify-end" title={title}>
              <div className="w-full bg-danger" style={{ height: h(b.errors) }} />
              <div className="w-full bg-accent" style={{ height: h(b.warns) }} />
              <div className="w-full bg-border" style={{ height: h(b.total - b.errors - b.warns) }} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const RESTART_CAUSE: Record<NonNullable<Restart["precededByCrashSignal"]>, string> = {
  oom: "precedido por falta de memória (OutOfMemory)",
  fatal: "precedido por erro FATAL",
};

function AvailabilityCard({ result }: { result: AnalysisResult }) {
  const { restarts, crashLoop } = result.summary.availability;
  if (restarts.length === 0) {
    return (
      <Card title="Disponibilidade e reinícios" icon={Power}>
        <p className="text-sm text-muted">
          Nenhum reinício do servidor foi detectado no trecho analisado (não há marcos de subida como
          &ldquo;up and running&rdquo; / WildFly started). Isso sugere que o serviço permaneceu no ar durante o período
          coberto — uma indisponibilidade percebida pode ter sido de lentidão, rede ou infraestrutura, não de queda do processo.
        </p>
      </Card>
    );
  }

  return (
    <Card title={`Disponibilidade e reinícios (${restarts.length})`} icon={Power}>
      {crashLoop && (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger">
          <strong>Instabilidade grave:</strong> vários reinícios em janela curta (possível crash loop). O serviço subiu e
          caiu repetidas vezes — investigue a causa que antecede os reinícios.
        </p>
      )}
      <p className="text-xs text-muted">
        Cada reinício é uma janela de indisponibilidade: o serviço caiu e voltou. O tempo é medido quando há uma parada
        registrada antes da subida.
      </p>
      <ul className="divide-y divide-border">
        {restarts.map((r, i) => (
          <li key={`${r.epochMs}-${i}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-mono tabular-nums text-muted">{formatLogTime(r.epochMs)}</span>
            <span className="text-xs">reinício · linha {r.line}</span>
            {r.downtimeMs != null && (
              <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                fora por ~{formatDuration(r.downtimeMs)}
              </span>
            )}
            {r.precededByCrashSignal ? (
              <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                {RESTART_CAUSE[r.precededByCrashSignal]}
              </span>
            ) : r.precededByShutdown ? (
              <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                parada registrada antes (possível manutenção)
              </span>
            ) : (
              <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
                sem parada limpa antes (possível queda abrupta)
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Reinício &ldquo;sem parada limpa antes&rdquo; indica que o processo caiu sem shutdown ordenado (queda abrupta,
        kill, falha de infra). &ldquo;Parada registrada antes&rdquo; costuma ser restart planejado.
      </p>
    </Card>
  );
}

export function LogResults({ result }: { result: AnalysisResult }) {
  const { summary, findings } = result;
  const counts = summary.counts;
  const solutions = useSolutions({
    issueIds: findings.map((f) => f.issue.id),
    hasSlow: result.slowOperations.length > 0,
  });

  return (
    <div className="space-y-4">
      {/* Cabeçalho com totais */}
      <Card title={`Resumo — ${result.fileName}`} icon={Gauge}>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="text-muted">{formatBytes(result.fileSize)}</span>
          <span><strong className="tabular-nums">{summary.totalEvents.toLocaleString("pt-BR")}</strong> eventos</span>
          {summary.firstEpochMs !== null && summary.lastEpochMs !== null && (
            <span className="text-muted">
              {formatLogTime(summary.firstEpochMs)} → {formatLogTime(summary.lastEpochMs)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "FATAL"] as LogLevel[])
            .filter((l) => counts[l] > 0)
            .map((l) => (
              <span key={l} className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs">
                <strong className={cn("tabular-nums", LEVEL_STYLE[l])}>{counts[l].toLocaleString("pt-BR")}</strong>{" "}
                <span className="text-muted">{l}</span>
              </span>
            ))}
        </div>
        {result.truncatedEvents && (
          <p className="text-xs text-muted">
            O arquivo tem muitos erros/avisos; o detalhe exibido foi limitado aos primeiros, mas as contagens e os
            problemas detectados consideram o arquivo inteiro.
          </p>
        )}
      </Card>

      {/* Disponibilidade e reinícios (chave para investigar indisponibilidade) */}
      <AvailabilityCard result={result} />

      {/* Ambiente (BootStrap) */}
      {summary.environment.length > 0 && (
        <Card title="Ambiente (detectado no BootStrap)" icon={Server}>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm @xl/main:grid-cols-2">
            {summary.environment.map((e) => (
              <div key={e.key} className="flex gap-2">
                <dt className="shrink-0 text-muted">{e.label}:</dt>
                <dd className="min-w-0 truncate font-mono text-xs" title={e.value}>{e.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* Problemas conhecidos */}
      <Card title={`Problemas conhecidos (${findings.length})`} icon={Info}>
        {findings.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum padrão de problema conhecido foi encontrado. Isso não garante ausência de problemas; veja os grupos
            de erro abaixo.
          </p>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.issue.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", SEVERITY_STYLE[f.issue.severity])}>
                    {SEVERITY_LABEL[f.issue.severity]}
                  </span>
                  <span className="text-sm font-medium">{f.issue.title}</span>
                  <span className="text-xs text-muted">
                    {f.count}× · a partir da linha {f.firstLine} · {formatLogTime(f.firstEpochMs)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted">{f.issue.hint}</p>
                <p className="mt-1 font-mono text-xs break-all text-muted/80">{f.sample}</p>
                {f.issue.checks && f.issue.checks.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-accent">
                      Como investigar ({f.issue.checks.length} passos)
                    </summary>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted">
                      {f.issue.checks.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ol>
                  </details>
                )}
                {f.issue.reference && (
                  <a
                    href={f.issue.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-accent hover:underline"
                  >
                    Procedimento oficial (Central de Atendimento TOTVS)
                  </a>
                )}
                {solutions.get(f.issue.id) && <SolutionLink solution={solutions.get(f.issue.id)!} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Lentidão (JSChronos) */}
      {result.slowOperations.length > 0 && (
        <Card title={`Operações lentas (${result.slowOperations.length})`} icon={Clock}>
          <p className="text-xs text-muted">
            O monitor do Fluig (JSChronos) registrou operações que demoraram a executar. Tempos altos indicam
            gargalo (ex.: dataset/consulta pesada, serviço externo lento).
          </p>
          <ul className="divide-y divide-border">
            {result.slowOperations.slice(0, 30).map((op) => (
              <li key={op.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", SEVERITY_STYLE[op.severity])}>
                  {SEVERITY_LABEL[op.severity]}
                </span>
                <span className="font-mono tabular-nums text-danger">{op.maxSeconds}s</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={op.name}>{op.name}</span>
                <span className="shrink-0 text-xs text-muted">{op.count}×</span>
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-accent">
              Como investigar ({SLOW_CHECKS.length} passos)
            </summary>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted">
              {SLOW_CHECKS.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </details>
          {solutions.get(SLOW_SOLUTION_ID) && <SolutionLink solution={solutions.get(SLOW_SOLUTION_ID)!} />}
        </Card>
      )}

      <Timeline result={result} />

      {/* Grupos de erro/aviso */}
      {summary.errorGroups.length > 0 && (
        <Card title={`Erros e avisos agrupados (${summary.errorGroups.length})`} icon={ListTree}>
          <p className="text-xs text-muted">
            Ocorrências equivalentes (ignorando números, ids e datas) foram agrupadas, da mais frequente para a menos.
          </p>
          <ul className="divide-y divide-border">
            {summary.errorGroups.slice(0, 50).map((g) => (
              <li key={g.signature} className="py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("font-mono font-semibold", LEVEL_STYLE[g.level])}>{g.level}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 tabular-nums">{g.count}×</span>
                  {g.exception && <span className="font-mono text-muted">{g.exception}</span>}
                  <span className="text-muted">· linha {g.firstLine}</span>
                </div>
                <p className="mt-1 text-sm break-all">{g.sample}</p>
                <p className="font-mono text-[11px] text-muted/70">{g.category}</p>
              </li>
            ))}
          </ul>
          {summary.errorGroups.length > 50 && (
            <p className="text-xs text-muted">Mostrando os 50 grupos mais frequentes de {summary.errorGroups.length}.</p>
          )}
        </Card>
      )}
    </div>
  );
}
