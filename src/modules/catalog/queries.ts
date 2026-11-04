import "server-only";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  type CatalogEntry,
  type CatalogExample,
  type CatalogParameter,
  type CatalogSearch,
} from "./types";

const ENTRY_COLUMNS =
  "id, slug, kind, name, http_method, path, summary, description, min_version, max_version, is_deprecated, compatibility_notes, examples, tags, source_url";

/** Remove caracteres com significado especial em filtros PostgREST / ILIKE. */
function sanitizeTerm(term: string) {
  return term.replace(/[%_*\\,():"]/g, " ").replace(/\s+/g, " ").trim();
}

/** Quebra a busca em termos (até 6): todos precisam aparecer, em qualquer ordem. */
export function searchTerms(q: string | undefined): string[] {
  return sanitizeTerm(q ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
}

export async function searchEntries({ q, kind, method, topic, group, page }: CatalogSearch) {
  const supabase = await createClient();

  let query = supabase
    .from("catalog_entries")
    .select(ENTRY_COLUMNS, { count: "exact" })
    .order("name", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (kind) query = query.eq("kind", kind);
  if (method) query = query.eq("http_method", method);
  if (topic) query = query.contains("topics", [topic]);
  if (group) query = query.contains("tags", [group]);

  // ilike ignora maiúsculas/minúsculas; cada termo pode estar no nome, caminho ou resumo.
  for (const term of searchTerms(q)) {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike.${pattern},path.ilike.${pattern},summary.ilike.${pattern}`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error("Não foi possível consultar o catálogo.");

  return {
    entries: (data ?? []) as unknown as CatalogEntry[],
    total: count ?? 0,
  };
}

/**
 * Opções dos filtros. Grupos = primeiro grupo oficial (tag) das entradas do tipo escolhido
 * (API/serviço/classe). Assuntos dependem da migration 0007: sem a coluna, o filtro some.
 */
export async function getFacets(kind: CatalogSearch["kind"]) {
  const supabase = await createClient();

  let groups: string[] = [];
  if (kind) {
    const { data } = await supabase.from("catalog_entries").select("tags").eq("kind", kind).limit(1000);
    groups = [...new Set((data ?? []).map((r) => (r.tags as string[])[0]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }

  const topicProbe = await supabase.from("catalog_entries").select("topics").limit(1);
  return { groups, topicsAvailable: !topicProbe.error };
}

export async function getEntry(id: string) {
  // id vem da URL: valida antes de consultar.
  if (!z.uuid().safeParse(id).success) return null;

  const supabase = await createClient();

  const [entryRes, paramsRes] = await Promise.all([
    supabase.from("catalog_entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("catalog_parameters")
      .select("id, direction, location, name, data_type, is_required, description, example, position")
      .eq("entry_id", id)
      .order("position", { ascending: true }),
  ]);

  if (entryRes.error) throw new Error("Não foi possível consultar a entrada.");
  if (!entryRes.data) return null;

  return {
    entry: entryRes.data as unknown as CatalogEntry,
    parameters: (paramsRes.data ?? []) as unknown as CatalogParameter[],
  };
}

/** Aceita apenas exemplos bem formados (examples é jsonb livre). */
export function parseExamples(raw: unknown): CatalogExample[] {
  const parsed = z
    .array(
      z.object({
        title: z.string().optional(),
        language: z.string().optional(),
        code: z.string(),
      }),
    )
    .safeParse(raw);
  return parsed.success ? parsed.data : [];
}
