import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ConversationSummary, Source } from "./types";

export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Não foi possível listar as conversas.");
  return (data ?? []) as ConversationSummary[];
}

export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, citations, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Não foi possível carregar a conversa.");
  return (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as "user" | "assistant",
    content: m.content as string,
    citations: (m.citations ?? []) as Source[],
    created_at: m.created_at as string,
  }));
}
