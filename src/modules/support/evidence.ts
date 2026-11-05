/**
 * Monta o "pacote de evidências" (texto estruturado) a partir da análise de log, da
 * validação de configurações e das correlações, para enviar ao diagnóstico com IA
 * (rota /api/diagnostics/analyze). Função pura. O texto é curto e factual: o diagnóstico
 * ainda redige segredos no servidor, mas aqui já evitamos despejar o log inteiro.
 */

import type { AnalysisResult } from "./stream-reader";
import type { ParsedConfig } from "./config-parser";
import type { ConfigIssue } from "./config-validation";
import type { Correlation } from "./correlation";
import { formatLogTime } from "./format";

export type EvidencePackage = {
  logAnalysis: AnalysisResult | null;
  configs: { fileName: string; parsed: ParsedConfig; issues: ConfigIssue[] }[];
  correlations: Correlation[];
};

const SEVERITY_ORDER = { alta: 0, media: 1, baixa: 2 } as const;

/** Monta o texto de evidências. `maxErrorGroups` limita o tamanho. */
export function buildEvidenceText(pkg: EvidencePackage, maxErrorGroups = 8): string {
  const parts: string[] = [];

  // Ambiente (do BootStrap do log)
  const env = pkg.logAnalysis?.summary.environment ?? [];
  if (env.length > 0) {
    parts.push("## Ambiente");
    parts.push(env.map((e) => `- ${e.label}: ${e.value}`).join("\n"));
  }

  // Resumo do log
  if (pkg.logAnalysis) {
    const s = pkg.logAnalysis.summary;
    const range =
      s.firstEpochMs !== null && s.lastEpochMs !== null
        ? ` (${formatLogTime(s.firstEpochMs)} a ${formatLogTime(s.lastEpochMs)})`
        : "";
    parts.push("## Log analisado");
    parts.push(
      `Arquivo "${pkg.logAnalysis.fileName}": ${s.totalEvents} eventos${range}. ` +
        `ERROR: ${s.counts.ERROR}, WARN: ${s.counts.WARN}, FATAL: ${s.counts.FATAL}.`,
    );

    if (pkg.logAnalysis.findings.length > 0) {
      parts.push("### Problemas conhecidos detectados no log");
      parts.push(
        pkg.logAnalysis.findings
          .map((f) => `- [${f.issue.severity}] ${f.issue.title} (${f.count}×, a partir da linha ${f.firstLine}): ${f.issue.hint}`)
          .join("\n"),
      );
    }

    const groups = pkg.logAnalysis.summary.errorGroups.slice(0, maxErrorGroups);
    if (groups.length > 0) {
      parts.push("### Principais erros/avisos (agrupados)");
      parts.push(
        groups
          .map((g) => `- [${g.level} ${g.count}×] ${g.exception ? `${g.exception}: ` : ""}${g.sample.slice(0, 160)}`)
          .join("\n"),
      );
    }
  }

  // Configurações
  for (const c of pkg.configs) {
    parts.push(`## Configuração: ${c.fileName}`);
    if (c.parsed.jvm) {
      const j = c.parsed.jvm;
      parts.push(`JVM: -Xms=${j.xms ?? "?"}, -Xmx=${j.xmx ?? "?"}, Metaspace=${j.metaspace ?? "?"} (máx ${j.maxMetaspace ?? "?"}).`);
    }
    if (c.parsed.datasources.length > 0) {
      parts.push(
        "Datasources: " +
          c.parsed.datasources
            .map((d) => `${d.poolName} (driver ${d.driver}, pool ${d.minPoolSize ?? "?"}..${d.maxPoolSize ?? "?"}, url ${d.connectionUrl})`)
            .join("; "),
      );
    }
    if (c.issues.length > 0) {
      const sorted = [...c.issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
      parts.push("Achados da validação: " + sorted.map((i) => `[${i.severity}] ${i.title}`).join("; ") + ".");
    }
  }

  // Correlações
  if (pkg.correlations.length > 0) {
    parts.push("## Correlações log × configuração");
    parts.push(pkg.correlations.map((c) => `- ${c.detail}`).join("\n"));
  }

  return parts.join("\n\n").slice(0, 18_000); // o diagnóstico aceita até 20k; deixa folga
}

/** Há evidência suficiente para valer um diagnóstico com IA? */
export function hasEvidence(pkg: EvidencePackage): boolean {
  const logHas =
    !!pkg.logAnalysis &&
    (pkg.logAnalysis.findings.length > 0 ||
      pkg.logAnalysis.summary.counts.ERROR > 0 ||
      pkg.logAnalysis.summary.errorGroups.length > 0);
  const configHas = pkg.configs.some((c) => c.issues.length > 0);
  return logHas || configHas || pkg.correlations.length > 0;
}
