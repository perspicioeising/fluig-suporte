import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRequest } from "@/lib/security/ssrf";
import {
  applyAuthHeaders,
  buildTargetUrl,
  loadCredentials,
  type EnvContext,
  type Failure,
} from "@/modules/environments/runtime";
import { findSchemaImports } from "./wsdl-parser";
import type { ParsedWsdl } from "./types";

const BUCKET = "wsdl-files";
const MAX_DOCUMENTS = 12;
const MAX_WSDL_BYTES = 2 * 1024 * 1024;

/* ------------------------------ Download ---------------------------------- */

/**
 * Baixa um WSDL (e os schemas/WSDLs importados) de um ambiente cadastrado.
 * Todas as URLs são confinadas à URL base do ambiente; se o WSDL apontar para
 * outro host (comum: hostname interno), reescrevemos para o host do ambiente.
 */
export async function downloadWsdlFromEnvironment(
  ctx: EnvContext,
  path: string,
): Promise<{ ok: true; main: string; documents: string[]; warnings: string[] } | Failure> {
  const { env } = ctx;
  const warnings: string[] = [];

  // Credenciais são opcionais para baixar WSDL (muitos são públicos).
  const loaded = await loadCredentials(env);
  const headers: Record<string, string> = { Accept: "text/xml, application/xml, */*" };

  const fetchXml = async (target: URL): Promise<string> => {
    applyAuthHeaders({
      authType: env.auth_type,
      credentials: loaded.ok ? loaded.credentials : null,
      setHeader: (name, value) => {
        headers[name] = value;
      },
      method: "GET",
      url: target,
    });
    const res = await safeRequest({ url: target, method: "GET", headers, timeoutMs: 20_000, maxBytes: MAX_WSDL_BYTES });
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status} ao baixar ${target.pathname}${target.search}`);
    }
    const text = res.body.toString("utf8").trim();
    if (!text.startsWith("<")) throw new Error(`Resposta de ${target.pathname} não é XML.`);
    return text;
  };

  const first = buildTargetUrl(env, path);
  if (!first.ok) return first;

  let main: string;
  try {
    main = await fetchXml(first.url);
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof Error ? error.message : "Falha ao baixar o WSDL." };
  }

  const documents = [main];
  const seen = new Set<string>([first.url.toString()]);
  const queue: { xml: string; url: URL; depth: number }[] = [{ xml: main, url: first.url, depth: 0 }];

  while (queue.length > 0 && documents.length < MAX_DOCUMENTS) {
    const current = queue.shift()!;
    if (current.depth >= 2) continue;

    let locations: string[];
    try {
      locations = findSchemaImports(current.xml);
    } catch {
      continue;
    }

    for (const location of locations) {
      if (documents.length >= MAX_DOCUMENTS) break;
      let resolved: URL;
      try {
        resolved = new URL(location, current.url);
      } catch {
        warnings.push(`Import ignorado (URL inválida): ${location}`);
        continue;
      }
      // Reescreve para o host do ambiente e valida contra a URL base.
      const rewritten = buildTargetUrl(env, `${resolved.pathname}${resolved.search}`);
      if (!rewritten.ok) {
        warnings.push(`Import fora do ambiente ignorado: ${location}`);
        continue;
      }
      const key = rewritten.url.toString();
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const xml = await fetchXml(rewritten.url);
        documents.push(xml);
        queue.push({ xml, url: rewritten.url, depth: current.depth + 1 });
      } catch (error) {
        warnings.push(`Não foi possível baixar o import ${location}: ${error instanceof Error ? error.message : "erro"}`);
      }
    }
  }

  return { ok: true, main, documents, warnings };
}

/* ------------------------------ Persistência ------------------------------ */

async function ensureBucket(admin: SupabaseClient) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  // Bucket privado e sem policies: só o servidor (service role) acessa.
  await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_WSDL_BYTES });
}

export async function removeWsdlFiles(paths: string[]) {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  await createAdminClient().storage.from(BUCKET).remove(clean);
}

/** Grava o WSDL (Storage) e as operações (banco). Substitui um WSDL de mesmo nome. */
export async function persistWsdl(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  name: string;
  xml: string;
  parsed: ParsedWsdl;
}): Promise<{ wsdlId: string; operations: number; warnings: string[] }> {
  const { supabase, workspaceId, userId, name, xml, parsed } = args;
  const warnings: string[] = [];

  // Reimportação: remove a versão anterior com o mesmo nome.
  const { data: previous } = await supabase
    .from("soap_wsdls")
    .select("id, storage_path")
    .eq("workspace_id", workspaceId)
    .eq("name", name);
  if (previous?.length) {
    await removeWsdlFiles(previous.map((p) => p.storage_path as string));
    await supabase.from("soap_wsdls").delete().in("id", previous.map((p) => p.id));
  }

  const { data: wsdl, error } = await supabase
    .from("soap_wsdls")
    .insert({
      workspace_id: workspaceId,
      name,
      target_namespace: parsed.targetNamespace,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !wsdl) throw new Error("Não foi possível registrar o WSDL.");
  const wsdlId = wsdl.id as string;

  // Arquivo original no Storage (best effort: falha vira aviso).
  try {
    const admin = createAdminClient();
    await ensureBucket(admin);
    const storagePath = `${workspaceId}/${wsdlId}.wsdl`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, new Blob([xml], { type: "text/xml" }), { upsert: true, contentType: "text/xml" });
    if (uploadError) throw uploadError;
    await supabase.from("soap_wsdls").update({ storage_path: storagePath }).eq("id", wsdlId);
  } catch {
    warnings.push("As operações foram importadas, mas o arquivo WSDL original não pôde ser salvo no Storage.");
  }

  const rows = parsed.operations.map((op) => ({
    workspace_id: workspaceId,
    wsdl_id: wsdlId,
    service_name: op.service,
    port_name: op.port,
    operation_name: op.name,
    soap_action: op.soapAction,
    input_schema: {
      style: op.style,
      use: op.use,
      soapVersion: op.soapVersion,
      endpoint: op.endpoint,
      documentation: op.documentation ?? null,
      faults: op.faults,
      shape: op.input,
    },
    output_schema: op.output,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error: insertError } = await supabase.from("soap_operations").insert(rows.slice(i, i + 100));
    if (insertError) {
      await supabase.from("soap_wsdls").delete().eq("id", wsdlId);
      throw new Error("Não foi possível gravar as operações do WSDL.");
    }
  }

  return { wsdlId, operations: rows.length, warnings };
}
