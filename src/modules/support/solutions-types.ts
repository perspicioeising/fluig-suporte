/**
 * Tipos e constantes de "solução oficial" compartilhados entre servidor e cliente.
 * Sem `server-only` para poder ser importado pelo componente de resultados (client).
 */

export type IssueSolution = {
  /** Id do problema conhecido, ou "slow-operations" para o grupo de lentidão. */
  issueId: string;
  /** Título da página oficial encontrada. */
  title: string;
  /** URL da página oficial (TDN) para abrir a fonte. */
  url: string;
  /** Pequeno resumo do trecho (para exibir inline). */
  snippet: string;
};

/** Id sintético do grupo de operações lentas (JSChronos). */
export const SLOW_SOLUTION_ID = "slow-operations";

/** Passos de investigação para operações lentas (JSChronos). */
export const SLOW_CHECKS: string[] = [
  "Identifique a operação/dataset mais lento da lista e verifique se é consulta a banco externo, serviço remoto ou processamento pesado.",
  "Correlacione o horário das execuções lentas com picos de uso no servidor (CPU, memória, I/O).",
  "Para dataset que acessa banco externo, revise a query e os índices da tabela consultada.",
  "Se a lentidão for em serviço externo, meça o tempo de resposta dele isoladamente a partir do servidor do Fluig.",
];
