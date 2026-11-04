import { HELP_SECTIONS } from "../../src/modules/help/content";
import type { ParseResult, ParsedDocument, SourceDefinition } from "./lib/types";

export const HELP_SOURCE: SourceDefinition = {
  slug: "app-help",
  name: "Ajuda do Fluig Integration Studio",
  kind: "docs",
  url: "/ajuda",
};

const MAX_CHUNK = 1500;

/** Quebra o corpo de uma seção por subtítulos (###) e, se preciso, por parágrafos. */
function splitBody(body: string): { heading: string | null; text: string }[] {
  const parts = body.split(/\n(?=### )/);
  const out: { heading: string | null; text: string }[] = [];

  for (const part of parts) {
    const match = part.match(/^### (.+)\n/);
    const heading = match ? match[1].trim() : null;
    const text = match ? part.slice(match[0].length) : part;

    if (text.length <= MAX_CHUNK) {
      if (text.trim()) out.push({ heading, text: text.trim() });
      continue;
    }

    // Seção grande: agrupa parágrafos/linhas de tabela até o limite.
    let buffer = "";
    for (const block of text.split(/\n{2,}/)) {
      if (buffer && buffer.length + block.length > MAX_CHUNK) {
        out.push({ heading, text: buffer.trim() });
        buffer = "";
      }
      buffer += `${block}\n\n`;
    }
    if (buffer.trim()) out.push({ heading, text: buffer.trim() });
  }
  return out;
}

/** Transforma o guia de uso do app (src/modules/help/content.ts) em documentos para o RAG. */
export function ingestHelp(): ParseResult {
  const documents: ParsedDocument[] = HELP_SECTIONS.map((section) => {
    const title = `Ajuda do Studio › ${section.title}`;
    const chunks = splitBody(section.body).map(({ heading, text }) => ({
      headingPath: heading ? [section.title, heading] : [section.title],
      content: `${title}${heading ? ` › ${heading}` : ""}\n\n${text}`,
    }));
    return {
      sourceSlug: HELP_SOURCE.slug,
      url: `/ajuda#${section.id}`,
      title,
      chunks,
    };
  });

  return { entries: [], warnings: [], sources: [HELP_SOURCE], documents };
}
