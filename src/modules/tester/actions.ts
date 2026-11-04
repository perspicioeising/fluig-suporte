"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WRITE_ROLES, getActiveWorkspace } from "@/lib/workspace";
import { SaveRequestSchema, type SaveRequestInput } from "./schemas";

export type ActionResult = { ok: boolean; message: string };

export async function saveRequest(input: SaveRequestInput): Promise<ActionResult> {
  const parsed = SaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const workspace = await getActiveWorkspace();
  if (!workspace || !(WRITE_ROLES as readonly string[]).includes(workspace.role)) {
    return { ok: false, message: "Você não tem permissão para salvar requisições." };
  }

  const supabase = await createClient();

  let collectionId = data.collectionId;
  if (!collectionId) {
    const name = data.newCollectionName?.trim();
    if (!name) return { ok: false, message: "Escolha uma coleção ou informe o nome de uma nova." };

    const { data: created, error } = await supabase
      .from("collections")
      .insert({ workspace_id: workspace.workspaceId, name, created_by: workspace.userId })
      .select("id")
      .single();
    if (error || !created) return { ok: false, message: "Não foi possível criar a coleção." };
    collectionId = created.id as string;
  }

  const { error } = await supabase.from("saved_requests").insert({
    workspace_id: workspace.workspaceId,
    collection_id: collectionId,
    environment_id: data.environmentId ?? null,
    name: data.name,
    method: data.method,
    path: data.path,
    query: data.query,
    headers: data.headers,
    body_type: data.bodyType,
    body: data.body ?? null,
    created_by: workspace.userId,
  });
  if (error) return { ok: false, message: "Não foi possível salvar a requisição." };

  revalidatePath("/tester");
  return { ok: true, message: "Requisição salva na coleção." };
}

export async function deleteSavedRequest(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Requisição inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("saved_requests").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir." };
  revalidatePath("/tester");
  return { ok: true, message: "Requisição excluída." };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Coleção inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir." };
  revalidatePath("/tester");
  return { ok: true, message: "Coleção excluída." };
}
