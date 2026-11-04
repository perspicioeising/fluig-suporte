"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/security/crypto";
import { ADMIN_ROLES, getActiveWorkspace } from "@/lib/workspace";
import type { AuthType, EnvFormState } from "./constants";
import { CredentialsSchemas, EnvironmentSchema, normalizeBaseUrl } from "./schemas";

const NO_PERMISSION: EnvFormState = {
  message: "Você não tem permissão para gerenciar ambientes neste workspace.",
};

function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}

function formObject(formData: FormData) {
  const out: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function createEnvironment(
  _state: EnvFormState,
  formData: FormData,
): Promise<EnvFormState> {
  const workspace = await getActiveWorkspace();
  if (!workspace || !(ADMIN_ROLES as readonly string[]).includes(workspace.role)) {
    return NO_PERMISSION;
  }

  const parsed = EnvironmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(parsed.data.base_url, parsed.data.auth_type);
  } catch (error) {
    return { errors: { base_url: [(error as Error).message] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fluig_environments").insert({
    workspace_id: workspace.workspaceId,
    name: parsed.data.name,
    base_url: baseUrl,
    auth_type: parsed.data.auth_type,
    is_active: parsed.data.is_active,
    allow_write_methods: parsed.data.allow_write_methods,
    created_by: workspace.userId,
  });

  if (error) {
    return {
      message:
        error.code === "23505"
          ? "Já existe um ambiente com esse nome."
          : "Não foi possível criar o ambiente.",
    };
  }

  revalidatePath("/configuracoes");
  return { ok: true, message: "Ambiente criado. Agora cadastre as credenciais, se houver." };
}

export async function updateEnvironment(
  _state: EnvFormState,
  formData: FormData,
): Promise<EnvFormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: "Ambiente inválido." };

  const parsed = EnvironmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(parsed.data.base_url, parsed.data.auth_type);
  } catch (error) {
    return { errors: { base_url: [(error as Error).message] } };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("fluig_environments")
    .select("id, workspace_id, auth_type")
    .eq("id", id.data)
    .maybeSingle();
  if (!current) return { message: "Ambiente não encontrado." };

  const { data: allowed } = await supabase.rpc("has_workspace_role", {
    ws: current.workspace_id,
    allowed_roles: [...ADMIN_ROLES],
  });
  if (!allowed) return NO_PERMISSION;

  const { error } = await supabase
    .from("fluig_environments")
    .update({
      name: parsed.data.name,
      base_url: baseUrl,
      auth_type: parsed.data.auth_type,
      is_active: parsed.data.is_active,
      allow_write_methods: parsed.data.allow_write_methods,
    })
    .eq("id", id.data);

  if (error) {
    return {
      message:
        error.code === "23505"
          ? "Já existe um ambiente com esse nome."
          : "Não foi possível salvar o ambiente.",
    };
  }

  // Trocar o tipo de autenticação invalida as credenciais antigas.
  if (current.auth_type !== parsed.data.auth_type) {
    await createAdminClient()
      .from("fluig_environments")
      .update({ encrypted_credentials: null })
      .eq("id", id.data)
      .eq("workspace_id", current.workspace_id);
  }

  revalidatePath("/configuracoes");
  return { ok: true, message: "Ambiente atualizado." };
}

export async function saveCredentials(
  _state: EnvFormState,
  formData: FormData,
): Promise<EnvFormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: "Ambiente inválido." };

  const supabase = await createClient();
  const { data: env } = await supabase
    .from("fluig_environments")
    .select("id, workspace_id, auth_type")
    .eq("id", id.data)
    .maybeSingle();
  if (!env) return { message: "Ambiente não encontrado." };

  const { data: allowed } = await supabase.rpc("has_workspace_role", {
    ws: env.workspace_id,
    allowed_roles: [...ADMIN_ROLES],
  });
  if (!allowed) return NO_PERMISSION;

  const authType = env.auth_type as AuthType;
  if (authType === "none") {
    return { message: "Este ambiente não usa autenticação." };
  }

  const parsed = CredentialsSchemas[authType].safeParse(formObject(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  // Gravação com service role: a coluna não é gravável pelo navegador.
  const { error } = await createAdminClient()
    .from("fluig_environments")
    .update({ encrypted_credentials: encryptJson(parsed.data) })
    .eq("id", env.id)
    .eq("workspace_id", env.workspace_id);
  if (error) return { message: "Não foi possível salvar as credenciais." };

  revalidatePath("/configuracoes");
  return { ok: true, message: "Credenciais salvas com segurança (cifradas)." };
}

export async function clearCredentials(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await createClient();
  const { data: env } = await supabase
    .from("fluig_environments")
    .select("id, workspace_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!env) return;

  const { data: allowed } = await supabase.rpc("has_workspace_role", {
    ws: env.workspace_id,
    allowed_roles: [...ADMIN_ROLES],
  });
  if (!allowed) return;

  await createAdminClient()
    .from("fluig_environments")
    .update({ encrypted_credentials: null })
    .eq("id", env.id)
    .eq("workspace_id", env.workspace_id);
  revalidatePath("/configuracoes");
}

export async function deleteEnvironment(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  // O RLS só permite a owner/admin do workspace.
  const supabase = await createClient();
  await supabase.from("fluig_environments").delete().eq("id", id.data);
  revalidatePath("/configuracoes");
}
