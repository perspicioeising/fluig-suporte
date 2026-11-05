/**
 * Catálogo de problemas conhecidos do Fluig, reconhecidos por padrões no server.log.
 * Determinístico: só aponta FATOS observados e aponta o procedimento oficial; não conclui
 * causa sem evidência. As URLs são da Central de Atendimento TOTVS (fontes oficiais).
 */

import type { LogEvent } from "./log-parser";

export type Severity = "alta" | "media" | "baixa";

export type KnownIssue = {
  id: string;
  title: string;
  severity: Severity;
  /** O que procurar na mensagem/detalhe do evento. */
  pattern: RegExp;
  /** Só considera eventos destes níveis (vazio = qualquer). */
  levels?: ("ERROR" | "FATAL" | "WARN")[];
  /** Explicação curta e neutra (fato, não diagnóstico fechado). */
  hint: string;
  /** Procedimento oficial (Central de Atendimento TOTVS). */
  reference?: string;
};

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    id: "db-connection-lost",
    title: "Falha/perda de conexão com o banco de dados",
    severity: "alta",
    pattern: /Communications link failure|Connection (?:refused|reset|timed out|is not available)|Could not (?:open|get) .*connection|CannotGetJdbcConnection|No operations allowed after connection closed|ORA-\d|SQLState/i,
    hint: "Há indícios de falha ao conectar ao banco. Verifique a disponibilidade do banco, a connection-url e o pool do datasource.",
    reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27663436384663",
  },
  {
    id: "port-in-use",
    title: "Conflito de porta na inicialização",
    severity: "alta",
    pattern: /Address already in use|bind.*(?:failed|in use)|BindException/i,
    hint: "Uma porta necessária já está em uso. Verifique se há outra instância do Fluig ou outro serviço ocupando a porta.",
    reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27663524686871",
  },
  {
    id: "update-failed",
    title: "Falha na execução de updates (atualização)",
    severity: "alta",
    pattern: /Update \d+ Failed|ERROR EXECUTING UPDATES|EXECUTION FAIL/i,
    hint: "Um update de banco falhou durante a inicialização. A inicialização pode ter sido interrompida; verifique o update indicado.",
    reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27664869385879",
  },
  {
    id: "rest-client-500",
    title: "FLUIG_REST_CLIENT_500 antes da inicialização completa",
    severity: "media",
    pattern: /FLUIG_REST_CLIENT_500/i,
    hint: "Serviço interno ainda não disponível no momento da chamada. Comum durante a subida; só é problema se persistir após a inicialização completa.",
    reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27663215539991",
  },
  {
    id: "rest-client-401",
    title: "FLUIG_REST_CLIENT_401 (acesso não autorizado entre serviços)",
    severity: "media",
    pattern: /FLUIG_REST_CLIENT_401|401 Unauthorized/i,
    hint: "Chamada interna recusada por autorização. Verifique se o servidor alcança a própria URL do Fluig e as credenciais internas.",
    reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27663617045783",
  },
  {
    id: "out-of-memory",
    title: "Falta de memória (OutOfMemory / Metaspace)",
    severity: "alta",
    pattern: /OutOfMemoryError|Java heap space|Metaspace|GC overhead limit exceeded/i,
    hint: "Esgotamento de memória da JVM. Confira -Xmx e MetaspaceSize no standalone.conf frente à RAM da máquina e à carga.",
  },
  {
    id: "md5-login-disabled",
    title: "Tentativa de login MD5 com autenticação MD5 desabilitada",
    severity: "baixa",
    pattern: /senha em MD5.*n[ãa]o est[áa] habilitado/i,
    levels: ["WARN"],
    hint: "Cliente/integração tentando autenticar em MD5, que está desabilitado para a empresa. Geralmente é configuração do integrador, não falha do servidor.",
  },
];

export type IssueFinding = {
  issue: KnownIssue;
  count: number;
  firstLine: number;
  firstEpochMs: number;
  lastEpochMs: number;
  /** Trecho representativo (primeira ocorrência), para evidência. */
  sample: string;
};

/**
 * Casa os eventos contra o catálogo. Um evento pode disparar mais de um problema.
 * Retorna os achados ordenados por severidade e frequência.
 */
export function detectKnownIssues(events: LogEvent[]): IssueFinding[] {
  const found = new Map<string, IssueFinding>();

  for (const e of events) {
    const haystack = e.detail ? `${e.message}\n${e.detail}` : e.message;
    for (const issue of KNOWN_ISSUES) {
      if (issue.levels && !issue.levels.includes(e.level as "ERROR" | "FATAL" | "WARN")) continue;
      if (!issue.pattern.test(haystack)) continue;
      const hit = found.get(issue.id);
      if (hit) {
        hit.count++;
        hit.firstEpochMs = Math.min(hit.firstEpochMs, e.epochMs);
        hit.lastEpochMs = Math.max(hit.lastEpochMs, e.epochMs);
      } else {
        found.set(issue.id, {
          issue,
          count: 1,
          firstLine: e.line,
          firstEpochMs: e.epochMs,
          lastEpochMs: e.epochMs,
          sample: e.message.slice(0, 300),
        });
      }
    }
  }

  const rank: Record<Severity, number> = { alta: 0, media: 1, baixa: 2 };
  return [...found.values()].sort((a, b) => rank[a.issue.severity] - rank[b.issue.severity] || b.count - a.count);
}

const SEVERITY_RANK: Record<Severity, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * Versão incremental de detectKnownIssues: para streaming de arquivos grandes, alimente
 * cada evento com feed(); result() devolve os achados ordenados. Assim a detecção cobre
 * TODOS os erros do arquivo, não só os primeiros retidos para exibição.
 */
export function createIssueAccumulator() {
  const found = new Map<string, IssueFinding>();
  return {
    feed(e: LogEvent) {
      const haystack = e.detail ? `${e.message}\n${e.detail}` : e.message;
      for (const issue of KNOWN_ISSUES) {
        if (issue.levels && !issue.levels.includes(e.level as "ERROR" | "FATAL" | "WARN")) continue;
        if (!issue.pattern.test(haystack)) continue;
        const hit = found.get(issue.id);
        if (hit) {
          hit.count++;
          hit.firstEpochMs = Math.min(hit.firstEpochMs, e.epochMs);
          hit.lastEpochMs = Math.max(hit.lastEpochMs, e.epochMs);
        } else {
          found.set(issue.id, {
            issue,
            count: 1,
            firstLine: e.line,
            firstEpochMs: e.epochMs,
            lastEpochMs: e.epochMs,
            sample: e.message.slice(0, 300),
          });
        }
      }
    },
    result(): IssueFinding[] {
      return [...found.values()].sort(
        (a, b) => SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] || b.count - a.count,
      );
    },
  };
}
