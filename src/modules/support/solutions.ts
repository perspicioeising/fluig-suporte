import "server-only";
import { createClient } from "@/lib/supabase/server";
import { KNOWN_ISSUES } from "./known-issues";
import { SLOW_SOLUTION_ID, type IssueSolution } from "./solutions-types";

/**
 * Lógica server-only para encontrar a solução oficial de cada problema detectado no log.
 * Os tipos compartilhados com o cliente ficam em `solutions-types.ts` (sem server-only).
 */

/** Query fixa para o grupo de operações lentas (JSChronos). */
const SLOW_QUERY = "métodos de contorno de lentidão na plataforma avaliação de lentidão desempenho";

const SNIPPET_CHARS = 240;

type SearchRow = {
  chunk_id: string;
  content: string;
  url: string | null;
  title: string | null;
};

async function bestMatch(
  rpc: (query: string) => Promise<SearchRow[]>,
  query: string,
): Promise<Omit<IssueSolution, "issueId"> | null> {
  const rows = await rpc(query);
  const top = rows.find((r) => r.url && r.title);
  if (!top || !top.url) return null;
  return {
    title: (top.title ?? "Documentação oficial").slice(0, 160),
    url: top.url,
    snippet: top.content.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS),
  };
}

/**
 * Para cada problema informado (ids) e, opcionalmente, o grupo de lentidão, busca a página
 * oficial correspondente. Usa o cliente do usuário (RLS): só enxerga a base do próprio workspace.
 * Problemas sem `kbQuery` são ignorados (não há busca a fazer).
 */
export async function findSolutions(issueIds: string[], hasSlow: boolean): Promise<IssueSolution[]> {
  const supabase = await createClient();

  const rpc = async (query: string): Promise<SearchRow[]> => {
    const { data, error } = await supabase.rpc("search_kb_chunks", { query_text: query, match_count: 3 });
    if (error) {
      // Base ainda não instalada ou indisponível: degrada em silêncio (sem solução sugerida).
      return [];
    }
    return (data ?? []) as SearchRow[];
  };

  const wanted = new Set(issueIds);
  const tasks: Promise<IssueSolution | null>[] = [];

  for (const issue of KNOWN_ISSUES) {
    if (!wanted.has(issue.id) || !issue.kbQuery) continue;
    const query = issue.kbQuery;
    tasks.push(
      bestMatch(rpc, query).then((m) => (m ? { issueId: issue.id, ...m } : null)),
    );
  }

  if (hasSlow) {
    tasks.push(bestMatch(rpc, SLOW_QUERY).then((m) => (m ? { issueId: SLOW_SOLUTION_ID, ...m } : null)));
  }

  const results = await Promise.all(tasks);
  return results.filter((r): r is IssueSolution => r !== null);
}
