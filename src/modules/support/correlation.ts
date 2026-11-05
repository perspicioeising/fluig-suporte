/**
 * Correlação entre o que foi achado nos logs e o que foi achado nas configurações.
 * Função pura: liga um problema do log a um parâmetro de configuração que pode estar
 * envolvido, para orientar a investigação. NÃO conclui causa — aponta relação plausível.
 */

import type { IssueFinding } from "./known-issues";
import type { ConfigIssue } from "./config-validation";
import type { ParsedConfig } from "./config-parser";

export type Correlation = {
  /** id do problema de log (known-issue) que origina a relação. */
  logIssueId: string;
  title: string;
  /** Texto da relação sugerida (fato + onde olhar). */
  detail: string;
};

/**
 * Regras de ligação: dado um problema conhecido no log, o que olhar na configuração.
 * `check` recebe os achados/paresed de config e devolve o texto, ou null se não se aplica.
 */
const RULES: {
  logIssueId: string;
  title: string;
  check: (config: ParsedConfig[], configIssues: ConfigIssue[]) => string | null;
}[] = [
  {
    logIssueId: "db-connection-lost",
    title: "Falha de banco no log × datasource na configuração",
    check: (configs) => {
      const ds = configs.flatMap((c) => c.datasources);
      if (ds.length === 0) return "O log indica falha de conexão com o banco. Nenhuma configuração de datasource foi enviada; envie o standalone.xml (ou domain.xml) para conferir connection-url, driver e pool.";
      const urls = ds.map((d) => `${d.poolName} → ${d.connectionUrl}`).join("; ");
      return `O log indica falha de conexão com o banco. Confira os datasources configurados: ${urls}. Verifique disponibilidade do banco, credenciais e o tamanho do pool (max-pool-size) sob carga.`;
    },
  },
  {
    logIssueId: "out-of-memory",
    title: "Falta de memória no log × -Xmx/Metaspace na configuração",
    check: (configs, configIssues) => {
      const jvm = configs.find((c) => c.jvm)?.jvm;
      const memIssue = configIssues.find((i) => i.id === "xmx-above-ram" || i.id === "xms-above-xmx" || i.id === "no-xmx");
      if (jvm) {
        const extra = memIssue ? ` A validação da configuração também apontou: "${memIssue.title}".` : "";
        return `O log indica esgotamento de memória. No standalone.conf: -Xms=${jvm.xms ?? "?"}, -Xmx=${jvm.xmx ?? "?"}, Metaspace=${jvm.metaspace ?? "?"}. Avalie aumentar -Xmx/Metaspace conforme a RAM e a carga.${extra}`;
      }
      return "O log indica esgotamento de memória. Envie o standalone.conf para conferir -Xms, -Xmx e Metaspace frente à RAM da máquina.";
    },
  },
  {
    logIssueId: "update-failed",
    title: "Falha de update no log × datasource/banco",
    check: (configs) => {
      const ds = configs.flatMap((c) => c.datasources).find((d) => d.jndi.includes("Fluig"));
      return ds
        ? `O log indica falha ao executar updates de banco na inicialização. O datasource principal aponta para ${ds.connectionUrl}. Verifique permissões do usuário "${ds.userName ?? "?"}" no banco e o update indicado no log.`
        : "O log indica falha ao executar updates de banco. Envie a configuração do datasource para conferir o banco de destino e as permissões.";
    },
  },
  {
    logIssueId: "port-in-use",
    title: "Conflito de porta no log × socket-binding",
    check: () =>
      "O log indica porta já em uso na inicialização. Verifique se há outra instância do Fluig rodando e os socket-bindings do servidor. Garanta que a porta não está ocupada por outro serviço.",
  },
];

/**
 * Gera correlações entre os achados do log e as configurações enviadas.
 * `logFindings` vem da análise de log; `configs`/`configIssues`, da validação de config.
 */
export function correlate(
  logFindings: IssueFinding[],
  configs: ParsedConfig[],
  configIssues: ConfigIssue[],
): Correlation[] {
  const out: Correlation[] = [];
  const presentLogIssues = new Set(logFindings.map((f) => f.issue.id));
  for (const rule of RULES) {
    if (!presentLogIssues.has(rule.logIssueId)) continue;
    const detail = rule.check(configs, configIssues);
    if (detail) out.push({ logIssueId: rule.logIssueId, title: rule.title, detail });
  }
  return out;
}
