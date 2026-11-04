"use server";

import * as z from "zod";
import * as cheerio from "cheerio";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeRequest } from "@/lib/security/ssrf";
import { WRITE_ROLES, getActiveWorkspace } from "@/lib/workspace";
import {
  buildTargetUrl,
  getRunnableEnvironment,
} from "@/modules/environments/runtime";
import { downloadWsdlFromEnvironment, persistWsdl, removeWsdlFiles } from "./import";
import type { SoapImportState } from "./schemas";
import { findSchemaImports, parseWsdl } from "./wsdl-parser";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SERVICES_PER_IMPORT = 40;
const SERVICE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

async function requireWriter() {
  const workspace = await getActiveWorkspace();
  if (!workspace || !(WRITE_ROLES as readonly string[]).includes(workspace.role)) return null;
  return workspace;
}

/** Importa um WSDL enviado como arquivo (.wsdl / .xml). Não faz nenhuma requisição de rede. */
export async function importWsdlFile(
  _state: SoapImportState,
  formData: FormData,
): Promise<SoapImportState> {
  const workspace = await requireWriter();
  if (!workspace) return { message: "Você não tem permissão para importar WSDLs neste workspace." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Selecione um arquivo WSDL." };
  if (file.size > MAX_FILE_BYTES) return { message: "O arquivo excede 2 MB." };
  if (!/\.(wsdl|xml)$/i.test(file.name)) return { message: "Use um arquivo .wsdl ou .xml." };

  const xml = (await file.text()).trim();
  let parsed;
  try {
    parsed = parseWsdl([xml]);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Não foi possível interpretar o WSDL." };
  }
  if (parsed.operations.length === 0) {
    return { message: "Nenhuma operação encontrada nesse WSDL.", warnings: parsed.warnings };
  }

  const warnings = [...parsed.warnings];
  try {
    if (findSchemaImports(xml).length > 0) {
      warnings.push(
        "O WSDL referencia arquivos externos (import/include) que não podem ser baixados em uploads. Para resolvê-los, importe pelo ambiente.",
      );
    }
  } catch {
    // já validado por parseWsdl
  }

  const typedName = String(formData.get("name") ?? "").trim();
  const name = (typedName || file.name.replace(/\.(wsdl|xml)$/i, "")).slice(0, 120);

  try {
    const supabase = await createClient();
    const result = await persistWsdl({
      supabase,
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
      name,
      xml,
      parsed,
    });
    revalidatePath("/soap");
    return {
      ok: true,
      message: `WSDL "${name}" importado com ${result.operations} operações.`,
      warnings: [...warnings, ...result.warnings],
    };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Falha ao importar o WSDL." };
  }
}

/** Lista os serviços publicados em {ambiente}/services (página pública do Fluig). */
export async function listEnvironmentServices(
  environmentId: string,
): Promise<{ ok: true; services: string[] } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(environmentId).success) return { ok: false, error: "Ambiente inválido." };

  const found = await getRunnableEnvironment(environmentId);
  if (!found.ok) return { ok: false, error: found.error };

  const target = buildTargetUrl(found.ctx.env, "/services");
  if (!target.ok) return { ok: false, error: target.error };

  try {
    const res = await safeRequest({
      url: target.url,
      method: "GET",
      headers: { Accept: "text/html" },
      timeoutMs: 20_000,
      maxBytes: 1024 * 1024,
    });
    if (res.status !== 200) {
      return { ok: false, error: `O ambiente respondeu HTTP ${res.status} em /services.` };
    }
    const $ = cheerio.load(res.body.toString("utf8"));
    const names = new Set<string>();
    $("td").each((_, td) => {
      const text = $(td).text().trim();
      if (SERVICE_NAME.test(text) && /Service$/.test(text)) names.add(text);
    });
    if (names.size === 0) {
      return { ok: false, error: "Nenhum serviço encontrado em /services. Informe o caminho do WSDL manualmente." };
    }
    return { ok: true, services: [...names].sort() };
  } catch {
    return { ok: false, error: "Não foi possível consultar /services no ambiente." };
  }
}

/** Importa um ou mais WSDLs de um ambiente (padrão documentado: /webdesk/<Serviço>?wsdl). */
export async function importWsdlFromEnvironment(
  _state: SoapImportState,
  formData: FormData,
): Promise<SoapImportState> {
  const environmentId = z.uuid().safeParse(formData.get("environmentId"));
  if (!environmentId.success) return { message: "Selecione um ambiente." };

  const services = formData
    .getAll("service")
    .map(String)
    .filter((s) => SERVICE_NAME.test(s));
  const customPath = String(formData.get("customPath") ?? "").trim();

  const targets: { name: string; path: string }[] = services
    .slice(0, MAX_SERVICES_PER_IMPORT)
    .map((s) => ({ name: s, path: `/webdesk/${s}?wsdl` }));
  if (customPath) {
    if (!/^\/(?!\/)[^\\\u0000-\u001f]{0,1999}$/.test(customPath)) {
      return { message: "Caminho inválido. Use algo como /webdesk/ECMDatasetService?wsdl." };
    }
    const guessed = customPath.split("?")[0].split("/").filter(Boolean).pop() ?? "wsdl";
    targets.push({ name: guessed, path: customPath });
  }
  if (targets.length === 0) return { message: "Selecione ao menos um serviço ou informe um caminho." };

  const found = await getRunnableEnvironment(environmentId.data);
  if (!found.ok) return { message: found.error };
  const { ctx } = found;

  const imported: string[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const target of targets) {
    const downloaded = await downloadWsdlFromEnvironment(ctx, target.path);
    if (!downloaded.ok) {
      failures.push(`${target.name}: ${downloaded.error}`);
      continue;
    }
    try {
      const parsed = parseWsdl(downloaded.documents);
      if (parsed.operations.length === 0) {
        failures.push(`${target.name}: nenhuma operação encontrada.`);
        continue;
      }
      await persistWsdl({
        supabase: ctx.supabase,
        workspaceId: ctx.env.workspace_id,
        userId: ctx.user.id,
        name: target.name.slice(0, 120),
        xml: downloaded.main,
        parsed,
      }).then((r) => warnings.push(...r.warnings.map((w) => `${target.name}: ${w}`)));
      warnings.push(...downloaded.warnings.map((w) => `${target.name}: ${w}`));
      warnings.push(...parsed.warnings.map((w) => `${target.name}: ${w}`));
      imported.push(target.name);
    } catch (error) {
      failures.push(`${target.name}: ${error instanceof Error ? error.message : "falha na importação"}`);
    }
  }

  revalidatePath("/soap");
  const summary = imported.length
    ? `${imported.length} WSDL(s) importado(s): ${imported.join(", ")}.`
    : "Nenhum WSDL importado.";
  return {
    ok: imported.length > 0,
    message: failures.length ? `${summary} Falhas: ${failures.join(" | ")}` : summary,
    warnings,
  };
}

export async function deleteWsdl(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await createClient();
  const { data } = await supabase.from("soap_wsdls").select("storage_path").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("soap_wsdls").delete().eq("id", id.data);
  if (!error && data?.storage_path) await removeWsdlFiles([data.storage_path as string]);
  revalidatePath("/soap");
}
