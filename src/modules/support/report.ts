/**
 * Monta o relatório técnico do atendimento em Markdown, pronto para copiar e colar.
 * Reúne o pacote de evidências (ambiente, log, configs, correlações) e, quando houver,
 * o diagnóstico da IA com as fontes citadas. Função pura.
 */

import type { Source } from "@/modules/assistant/types";
import type { EvidencePackage } from "./evidence";
import { formatBytes, formatLogTime } from "./format";

const SEVERITY_ORDER = { alta: 0, media: 1, baixa: 2 } as const;
const SEVERITY_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

export type ReportInput = {
  pkg: EvidencePackage;
  /** Diagnóstico da IA já gerado (Markdown), ou null se não foi executado. */
  diagnosisMarkdown: string | null;
  diagnosisSources: Source[];
  /** Data/hora da geração (parâmetro para testes determinísticos). */
  now?: Date;
};

export function buildReport({ pkg, diagnosisMarkdown, diagnosisSources, now = new Date() }: ReportInput): string {
  const L: string[] = [];
  const dateStr = now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  L.push("# Relatório técnico — Análise Fluig");
  L.push(`Gerado em ${dateStr} pelo Fluig Integration Studio.`);

  // Ambiente
  const env = pkg.logAnalysis?.summary.environment ?? [];
  if (env.length > 0) {
    L.push("\n## Ambiente");
    for (const e of env) L.push(`- **${e.label}:** ${e.value}`);
  }

  // Log
  if (pkg.logAnalysis) {
    const s = pkg.logAnalysis.summary;
    L.push("\n## Log analisado");
    L.push(`- **Arquivo:** ${pkg.logAnalysis.fileName} (${formatBytes(pkg.logAnalysis.fileSize)})`);
    L.push(`- **Eventos:** ${s.totalEvents.toLocaleString("pt-BR")} — ERROR: ${s.counts.ERROR}, WARN: ${s.counts.WARN}, FATAL: ${s.counts.FATAL}`);
    if (s.firstEpochMs !== null && s.lastEpochMs !== null) {
      L.push(`- **Período:** ${formatLogTime(s.firstEpochMs)} a ${formatLogTime(s.lastEpochMs)}`);
    }

    if (pkg.logAnalysis.findings.length > 0) {
      L.push("\n### Problemas conhecidos detectados");
      for (const f of pkg.logAnalysis.findings) {
        L.push(`- **[${SEVERITY_LABEL[f.issue.severity]}] ${f.issue.title}** (${f.count}×, a partir da linha ${f.firstLine})`);
        L.push(`  - ${f.issue.hint}`);
        if (f.issue.reference) L.push(`  - Procedimento oficial: ${f.issue.reference}`);
      }
    }

    const groups = s.errorGroups.slice(0, 10);
    if (groups.length > 0) {
      L.push("\n### Principais erros e avisos (agrupados)");
      for (const g of groups) {
        L.push(`- **[${g.level} ${g.count}×]** ${g.exception ? `\`${g.exception}\` — ` : ""}${g.sample.slice(0, 180)}`);
      }
    }
  }

  // Configurações
  for (const c of pkg.configs) {
    L.push(`\n## Configuração: ${c.fileName}`);
    if (c.parsed.jvm) {
      const j = c.parsed.jvm;
      L.push(`- **JVM:** -Xms=${j.xms ?? "?"}, -Xmx=${j.xmx ?? "?"}, Metaspace=${j.metaspace ?? "?"} (máx ${j.maxMetaspace ?? "?"})`);
    }
    for (const d of c.parsed.datasources) {
      L.push(`- **Datasource ${d.poolName}:** driver ${d.driver}, pool ${d.minPoolSize ?? "?"}..${d.maxPoolSize ?? "?"}, \`${d.connectionUrl}\``);
    }
    if (c.issues.length > 0) {
      const sorted = [...c.issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
      L.push("\n### Achados da validação");
      for (const i of sorted) L.push(`- **[${SEVERITY_LABEL[i.severity]}] ${i.title}** — ${i.detail}`);
    }
  }

  // Correlações
  if (pkg.correlations.length > 0) {
    L.push("\n## Correlações log × configuração");
    for (const c of pkg.correlations) L.push(`- **${c.title}** — ${c.detail}`);
  }

  // Diagnóstico da IA
  if (diagnosisMarkdown && diagnosisMarkdown.trim()) {
    L.push("\n## Diagnóstico assistido por IA");
    L.push(diagnosisMarkdown.trim());
    const cited = diagnosisSources.filter((s) => s.cited);
    const list = cited.length > 0 ? cited : diagnosisSources;
    if (list.length > 0) {
      L.push("\n### Fontes consultadas");
      for (const s of list) L.push(`- [${s.index}] ${s.title} — ${s.url}`);
    }
    L.push("\n> Diagnóstico gerado por IA com base na documentação oficial; é apoio à investigação e pode conter erros. Confirme as causas antes de alterar o ambiente.");
  }

  L.push("\n---");
  L.push("_Credenciais e segredos foram ocultados automaticamente. Este relatório não contém o log bruto._");

  return L.join("\n");
}
