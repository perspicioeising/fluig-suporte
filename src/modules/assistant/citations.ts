import type { Source } from "./types";

/** Marca como citadas as fontes cujo número [n] aparece no texto da resposta. */
export function markCitedSources(text: string, sources: Source[]): Source[] {
  const cited = new Set(
    [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
  );
  return sources.map((s) => ({ ...s, cited: cited.has(s.index) }));
}
