import { createHash } from "node:crypto";
import type { NormalizedEntry } from "./types";

/**
 * Texto de uma entrada para a base de conhecimento (RAG).
 * Contém apenas o que consta na documentação oficial.
 */
export function entryToChunk(entry: NormalizedEntry): string {
  const lines: string[] = [];

  lines.push(
    [entry.http_method, entry.path].filter(Boolean).join(" ") || entry.name,
  );
  lines.push(`Nome: ${entry.name}`);
  if (entry.tags.length) lines.push(`Grupo: ${entry.tags.join(", ")}`);
  if (entry.is_deprecated) lines.push("Situação: depreciado");
  if (entry.summary) lines.push(`Resumo: ${entry.summary}`);
  if (entry.description) lines.push(`Descrição: ${entry.description}`);

  const describe = (direction: "input" | "output", title: string) => {
    const items = entry.parameters.filter((p) => p.direction === direction);
    if (items.length === 0) return;
    lines.push(`${title}:`);
    for (const p of items) {
      const parts = [
        `- ${p.name} (${p.location}${p.data_type ? `, ${p.data_type}` : ""}${p.is_required ? ", obrigatório" : ""})`,
      ];
      if (p.description) parts.push(`: ${p.description}`);
      lines.push(parts.join(""));
    }
  };
  describe("input", "Parâmetros de entrada");
  describe("output", "Retorno");

  for (const example of entry.examples) {
    lines.push(`Exemplo (${example.title}, ${example.language}):`);
    lines.push(example.code);
  }

  lines.push(`Fonte: ${entry.source_url}`);
  return lines.join("\n");
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
