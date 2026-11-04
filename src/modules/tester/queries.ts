import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listEnvironments } from "@/modules/environments/queries";
import type { CollectionWithRequests, HistoryItem } from "./schemas";

export async function getTesterData() {
  const supabase = await createClient();

  const [environments, collectionsRes, historyRes] = await Promise.all([
    listEnvironments(),
    supabase
      .from("collections")
      .select(
        "id, name, saved_requests(id, name, method, path, query, headers, body_type, body, environment_id)",
      )
      .order("name", { ascending: true })
      .order("name", { ascending: true, referencedTable: "saved_requests" }),
    supabase
      .from("request_history")
      .select(
        "id, environment_id, method, url, status_code, duration_ms, error, created_at, request_headers, request_body",
      )
      .eq("kind", "rest")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  return {
    environments,
    collections: (collectionsRes.data ?? []) as unknown as CollectionWithRequests[],
    history: (historyRes.data ?? []) as unknown as HistoryItem[],
  };
}
