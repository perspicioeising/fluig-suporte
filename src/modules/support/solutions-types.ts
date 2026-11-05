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
