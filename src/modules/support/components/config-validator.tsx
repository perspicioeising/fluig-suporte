"use client";

import { useState } from "react";
import { Gauge, Info, Server, Settings2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_INFO, maskConfigSecrets, parseConfig, type ParsedConfig } from "../config-parser";
import { validateConfig, type ConfigIssue, type VersionContext } from "../config-validation";
import type { Severity } from "../known-issues";

const fieldClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

const SEVERITY_STYLE: Record<Severity, string> = {
  alta: "border-danger/40 bg-danger/10 text-danger",
  media: "border-accent/40 bg-accent/10 text-accent",
  baixa: "border-border bg-surface-2 text-muted",
};
const SEVERITY_LABEL: Record<Severity, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Analyzed = { fileName: string; parsed: ParsedConfig; issues: ConfigIssue[] };

/**
 * Validador de configurações do Fluig. Lê o arquivo no navegador (não envia a servidor),
 * mascara senhas e aplica as regras por versão/arquitetura informadas.
 */
export type ConfigAnalyzed = Analyzed;

export function ConfigValidator({ onResults }: { onResults?: (list: Analyzed[]) => void } = {}) {
  const [files, setFiles] = useState<Analyzed[]>([]);
  const [fluigVersion, setFluigVersion] = useState("");
  const [ramGb, setRamGb] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ctx: VersionContext = {
    fluigVersion: fluigVersion.trim() || null,
    ramGb: ramGb.trim() ? Number(ramGb) : null,
  };

  async function handleFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const analyzed: Analyzed[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" excede 5 MB.`);
        continue;
      }
      const text = maskConfigSecrets(await file.text()); // mascara ANTES de guardar/exibir
      const parsed = parseConfig(text, file.name);
      analyzed.push({ fileName: file.name, parsed, issues: validateConfig(parsed, ctx) });
    }
    setFiles((prev) => {
      const next = [...prev, ...analyzed];
      onResults?.(next);
      return next;
    });
  }

  // Revalida ao mudar versão/RAM (sem reler o arquivo).
  function revalidate(next: VersionContext) {
    setFiles((prev) => {
      const updated = prev.map((a) => ({ ...a, issues: validateConfig(a.parsed, next) }));
      onResults?.(updated);
      return updated;
    });
  }

  return (
    <div className="space-y-4">
      {/* Contexto do ambiente */}
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 @xl/main:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="cfg-version" className="text-xs font-medium">Versão do Fluig (opcional)</label>
          <input
            id="cfg-version"
            value={fluigVersion}
            onChange={(e) => {
              setFluigVersion(e.target.value);
              revalidate({ fluigVersion: e.target.value.trim() || null, ramGb: ctx.ramGb });
            }}
            placeholder="ex.: 2.0.0 ou 1.8.2"
            className={cn(fieldClass, "w-full")}
            autoComplete="off"
          />
          <p className="text-xs text-muted">Até 1.8.2: domain.xml + host.xml. A partir da 2.0: standalone.xml.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="cfg-ram" className="text-xs font-medium">RAM da máquina em GB (opcional)</label>
          <input
            id="cfg-ram"
            type="number"
            min="1"
            value={ramGb}
            onChange={(e) => {
              setRamGb(e.target.value);
              revalidate({ fluigVersion: ctx.fluigVersion, ramGb: e.target.value.trim() ? Number(e.target.value) : null });
            }}
            placeholder="ex.: 16"
            className={cn(fieldClass, "w-full")}
          />
          <p className="text-xs text-muted">Permite checar -Xmx do standalone.conf contra a memória disponível.</p>
        </div>
      </div>

      {/* Upload */}
      <div className="rounded-lg border-2 border-dashed border-border bg-surface p-6 text-center">
        <Settings2 className="mx-auto size-8 text-accent" aria-hidden />
        <p className="mt-2 text-sm font-medium">Envie standalone.xml, domain.xml, host.xml ou standalone.conf</p>
        <p className="mt-1 text-xs text-muted">
          Processados no seu navegador — <strong>não são enviados</strong> a nenhum servidor. Senhas de datasource são
          mascaradas automaticamente. Pode selecionar vários.
        </p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
          <Upload className="size-4" aria-hidden />
          Selecionar arquivos
          <input
            type="file"
            multiple
            accept=".xml,.conf,text/xml,application/xml,text/plain"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
      )}

      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{files.length} arquivo(s) analisado(s)</p>
          <button
            type="button"
            onClick={() => {
              setFiles([]);
              onResults?.([]);
            }}
            className="text-xs text-accent hover:underline"
          >
            Limpar
          </button>
        </div>
      )}

      {files.map((a, idx) => (
        <ConfigCard key={`${a.fileName}-${idx}`} analyzed={a} />
      ))}
    </div>
  );
}

function ConfigCard({ analyzed }: { analyzed: Analyzed }) {
  const { fileName, parsed, issues } = analyzed;
  const info = KIND_INFO[parsed.kind];

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Server className="size-4 text-accent" aria-hidden />
        {fileName}
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted">
          {info.label}{info.versionHint ? ` · ${info.versionHint}` : ""}
        </span>
      </h2>

      {parsed.warnings.map((w, i) => (
        <p key={i} className="text-xs text-muted">{w}</p>
      ))}

      {/* JVM */}
      {parsed.jvm && (
        <dl className="grid gap-x-6 gap-y-1 text-sm @xl/main:grid-cols-2">
          <Row label="Memória (min/max)" value={`${parsed.jvm.memoryMin ?? "?"} / ${parsed.jvm.memoryMax ?? "?"}`} />
          <Row label="-Xms / -Xmx" value={`${parsed.jvm.xms ?? "?"} / ${parsed.jvm.xmx ?? "?"}`} />
          <Row label="Metaspace" value={`${parsed.jvm.metaspace ?? "?"} (máx ${parsed.jvm.maxMetaspace ?? "?"})`} />
          <Row label="JAVA_HOME" value={parsed.jvm.javaHome ?? "?"} mono />
        </dl>
      )}

      {/* Datasources */}
      {parsed.datasources.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            <Gauge className="size-3.5" aria-hidden /> Datasources ({parsed.datasources.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Pool</th>
                  <th className="py-1 pr-3 font-medium">Driver</th>
                  <th className="py-1 pr-3 font-medium">Pool (min/max)</th>
                  <th className="py-1 pr-3 font-medium">Usuário</th>
                  <th className="py-1 font-medium">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.datasources.map((ds) => (
                  <tr key={ds.poolName + ds.jndi}>
                    <td className="py-1.5 pr-3 font-mono">{ds.poolName}</td>
                    <td className="py-1.5 pr-3 font-mono">{ds.driver}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{ds.minPoolSize ?? "?"} / {ds.maxPoolSize ?? "?"}</td>
                    <td className="py-1.5 pr-3 font-mono">{ds.userName ?? "-"}</td>
                    <td className="py-1.5 font-mono break-all text-muted">{ds.connectionUrl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Achados */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          <Info className="size-3.5" aria-hidden /> Achados ({issues.length})
        </h3>
        {issues.length === 0 ? (
          <p className="text-sm text-muted">Nenhum problema detectado pelas regras atuais.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((i) => (
              <li key={i.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", SEVERITY_STYLE[i.severity])}>
                    {SEVERITY_LABEL[i.severity]}
                  </span>
                  <span className="text-sm font-medium">{i.title}</span>
                </div>
                <p className="mt-1.5 text-sm text-muted">{i.detail}</p>
                {i.reference && (
                  <a href={i.reference} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
                    Procedimento oficial (Central de Atendimento TOTVS)
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className={cn("min-w-0 truncate", mono && "font-mono text-xs")} title={value}>{value}</dd>
    </div>
  );
}
