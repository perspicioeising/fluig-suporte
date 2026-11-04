import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace ativo do usuário. No MVP cada usuário tem um workspace pessoal;
 * o modelo já suporta vários (usa o mais antigo como padrão).
 */
export const getActiveWorkspace = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: user.id,
    workspaceId: data.workspace_id as string,
    role: data.role as "owner" | "admin" | "member" | "viewer",
  };
});

export const WRITE_ROLES = ["owner", "admin", "member"] as const;
export const ADMIN_ROLES = ["owner", "admin"] as const;
