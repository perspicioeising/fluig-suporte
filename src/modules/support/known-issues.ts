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

  // ---- Dicionário de Logs e páginas de performance (TDN) ----
  {
    id: "custom-event-error",
    title: "Erro em evento customizado do cliente",
    severity: "media",
    pattern: /ERRO AO EXECUTAR SCRIPT|Executando evento :.*(?:NOK|Exception)|ScriptingLog.*(?:Erro|Exception)/i,
    hint: "Um evento/customização do cliente lançou erro. Verifique o evento e a linha citada no log (o Fluig costuma indicar o número da linha do script).",
  },
  {
    id: "impersonation-denied",
    title: "Acesso negado por falta de permissão de personificação",
    severity: "media",
    pattern: /sem permiss[ãa]o de personifica|FDNAccessDeniedException.*personifica/i,
    hint: "Integração tentou personificar um usuário sem permissão. Em OAuth application, no usuário aplicativo, habilite \"Permitir impersonalização\".",
  },
  {
    id: "dataset-class-not-found",
    title: "Classe não encontrada ao executar dataset",
    severity: "media",
    pattern: /Erro ao executar o dataset.*ClassNotFoundException|@ds_\w+ diz:.*ClassNotFoundException/i,
    hint: "Um dataset chamou uma classe Java que o serviço não encontrou. Verifique a dependência/biblioteca referenciada no desenvolvimento.",
  },
  {
    id: "integration-service-timeout",
    title: "Timeout ao conectar a um serviço externo cadastrado",
    severity: "alta",
    pattern: /Connect to [\d.]+:\d+.*(?:Connection timed out|failed)|HttpHostConnectException/i,
    hint: "Falha de comunicação com um serviço externo cadastrado no Fluig. Verifique se o serviço está disponível e se o servidor do Fluig alcança o endereço/porta (teste via Postman/SoapUI no próprio servidor).",
  },
  {
    id: "war-access-denied",
    title: "Permissão negada ao copiar/implantar arquivo (apps)",
    severity: "alta",
    pattern: /AccessDeniedException.*\.(?:war|ear|jar)|exists but is read-only|FileSystemException.*(?:pageIcon|apps)/i,
    hint: "O processo não conseguiu gravar em pastas do Fluig (apps/pageIcon). Libere permissão de escrita para o usuário do serviço e verifique antivírus/backup varrendo as pastas.",
  },
  {
    id: "widget-duplicated",
    title: "Widget duplicada no deploy",
    severity: "media",
    pattern: /DuplicatedResourceException|wcmapplicationcenter\.duplicatedresource/i,
    hint: "O deploy entende que a widget já existe. Para atualizar, o nome do widget, o context-root (jboss-web.xml) e o application.code (application.info) devem ser os mesmos da widget existente e únicos.",
  },
  {
    id: "x11-fontconfig",
    title: "Falha de fontes (X11/fontconfig) ao gerar relatório",
    severity: "media",
    pattern: /X11FontManager|FontConfiguration|libfontconfig/i,
    hint: "Geração de relatório falhou por falta de biblioteca de fontes no servidor Linux. Instale a libfontconfig1.",
  },
  {
    id: "native-lib-load",
    title: "Falha ao carregar biblioteca nativa (.dll/.so)",
    severity: "media",
    pattern: /UnsatisfiedLinkError|jmscapi\.dll|side-by-side|configuração lado a lado/i,
    hint: "Uma biblioteca nativa não carregou (ex.: assinatura digital). No Windows, instale o Microsoft Visual C++ Redistributable; verifique antivírus/backup varrendo as pastas do Fluig.",
  },
];

/**
 * Lentidão: o JSChronos registra "<algo> executou por N segundos". Tratado à parte do
 * catálogo porque a severidade depende do tempo (N) — extraímos o maior tempo observado.
 */
const SLOW_RE = /(?:JSChronos].*?)?([\w.$]+)\s+executou por\s+(\d+)\s+segundos/i;
const SLOW_WARN_SECONDS = 10; // acima disso já é lento o bastante para anotar
const SLOW_HIGH_SECONDS = 60; // acima de 1 min: severidade alta

export type SlowOperation = {
  /** Operação/dataset mais lento observado. */
  name: string;
  maxSeconds: number;
  count: number;
  severity: Severity;
  firstLine: number;
};

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
  // Operações lentas (JSChronos), agregadas por nome: guardamos o maior tempo e a contagem.
  const slow = new Map<string, { maxSeconds: number; count: number; firstLine: number }>();

  function feedSlow(e: LogEvent) {
    const m = SLOW_RE.exec(e.message);
    if (!m) return;
    const name = m[1];
    const seconds = Number(m[2]);
    if (!Number.isFinite(seconds) || seconds < SLOW_WARN_SECONDS) return;
    const hit = slow.get(name);
    if (hit) {
      hit.maxSeconds = Math.max(hit.maxSeconds, seconds);
      hit.count++;
    } else {
      slow.set(name, { maxSeconds: seconds, count: 1, firstLine: e.line });
    }
  }

  return {
    feed(e: LogEvent) {
      feedSlow(e);
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
    /** Operações lentas observadas, da mais lenta para a menos. */
    slowOperations(): SlowOperation[] {
      return [...slow.entries()]
        .map(([name, v]) => ({
          name,
          maxSeconds: v.maxSeconds,
          count: v.count,
          firstLine: v.firstLine,
          severity: (v.maxSeconds >= SLOW_HIGH_SECONDS ? "alta" : "media") as Severity,
        }))
        .sort((a, b) => b.maxSeconds - a.maxSeconds);
    },
  };
}
