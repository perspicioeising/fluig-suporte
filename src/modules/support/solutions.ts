import "server-only";
import { createClient } from "@/lib/supabase/server";
import { KNOWN_ISSUES } from "./known-issues";
import { SLOW_SOLUTION_ID, type IssueSolution } from "./solutions-types";

/**
 * Lógica server-only para encontrar a solução oficial de cada problema detectado no log.
 * Os tipos compartilhados com o cliente ficam em `solutions-types.ts` (sem server-only).
 */

/** Query fixa para o grupo de operações lentas (JSChronos). */
const SLOW_QUERY = "contorno de lentidão";

const SNIPPET_CHARS = 240;

type SearchRow = {
  chunk_id: string;
  content: string;
  /** Nomes conforme a função search_kb_chunks (migration 0006). */
  source_url: string | null;
  source_title: string | null;
};

/** Conteúdo curto tende a ser página-índice/navegação; preferimos trechos substanciais. */
const MIN_SUBSTANTIAL_CHARS = 200;

const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "e", "ou", "o", "a", "os", "as", "em", "no", "na", "com", "para", "por"]);

/** Palavras significativas da query (minúsculas, sem stopwords/acentos irrelevantes). */
function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Quantas palavras da query aparecem no título do resultado (0..n). */
function titleScore(title: string | null, kws: string[]): number {
  if (!title) return 0;
  const t = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return kws.filter((w) => t.includes(w)).length;
}

async function bestMatch(
  rpc: (query: string) => Promise<SearchRow[]>,
  query: string,
): Promise<Omit<IssueSolution, "issueId"> | null> {
  const rows = (await rpc(query)).filter((r) => r.source_url && r.source_title);
  if (rows.length === 0) return null;

  const kws = keywords(query);
  // Preferimos a página cujo TÍTULO casa melhor com a query (um "Configuração do banco de
  // dados SQL Server" deve vencer um "Instalação da plataforma" que só é denso em termos).
  // Entre títulos empatados, mantém a ordem de relevância da RPC. Despriorizamos trechos curtos.
  let best = rows[0];
  let bestScore = -1;
  rows.forEach((r, i) => {
    const substantial = r.content.trim().length >= MIN_SUBSTANTIAL_CHARS ? 1 : 0;
    // peso forte no título, desempate por posição (quanto menor i, melhor) e por conteúdo.
    const score = titleScore(r.source_title, kws) * 10 + substantial - i * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  });
  if (!best.source_url) return null;
  return {
    title: (best.source_title ?? "Documentação oficial").slice(0, 160),
    url: best.source_url,
    snippet: best.content.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS),
  };
}

/** Par id → termos de busca, usado para achados de config (ids dinâmicos). */
export type SolutionQuery = { id: string; query: string };

/**
 * Busca a página oficial correspondente a cada problema. Entradas:
 *  - `issueIds`: ids de problemas conhecidos do log (a query vem do catálogo KNOWN_ISSUES).
 *  - `hasSlow`: inclui o grupo de operações lentas (JSChronos).
 *  - `queries`: pares id→query diretos (achados de config, cujos ids são dinâmicos).
 * Usa o cliente do usuário (RLS): só enxerga a base do próprio workspace. Problemas sem
 * query são ignorados. Ids repetidos são resolvidos uma única vez.
 */
export async function findSolutions(
  issueIds: string[],
  hasSlow: boolean,
  queries: SolutionQuery[] = [],
): Promise<IssueSolution[]> {
  const supabase = await createClient();

  const rpc = async (query: string): Promise<SearchRow[]> => {
    // 5 candidatos: o bestMatch filtra páginas-índice e prefere o trecho mais substancial.
    const { data, error } = await supabase.rpc("search_kb_chunks", { query_text: query, match_count: 5 });
    if (error) {
      // Base ainda não instalada ou indisponível: degrada em silêncio (sem solução sugerida).
      return [];
    }
    return (data ?? []) as SearchRow[];
  };

  // Monta a lista de buscas (id → query), sem duplicar ids.
  const byId = new Map<string, string>();
  const wanted = new Set(issueIds);
  for (const issue of KNOWN_ISSUES) {
    if (wanted.has(issue.id) && issue.kbQuery) byId.set(issue.id, issue.kbQuery);
  }
  if (hasSlow) byId.set(SLOW_SOLUTION_ID, SLOW_QUERY);
  for (const q of queries) {
    if (q.id && q.query && !byId.has(q.id)) byId.set(q.id, q.query);
  }

  const tasks = [...byId.entries()].map(([issueId, query]) =>
    bestMatch(rpc, query).then((m) => (m ? { issueId, ...m } : null)),
  );

  const results = await Promise.all(tasks);
  return results.filter((r): r is IssueSolution => r !== null);
}
