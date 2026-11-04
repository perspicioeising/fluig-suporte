import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { WRITE_ROLES, getActiveWorkspace } from "@/lib/workspace";
import { CHAT_MODEL, MAX_OUTPUT_TOKENS, getAnthropicClient } from "./anthropic";
import { markCitedSources } from "./citations";
import { NO_SOURCES_MESSAGE, SYSTEM_PROMPT, buildUserTurn } from "./prompt";
import { retrieveSources, type RetrievedSource } from "./retrieve";
import type { ChatRequest, Source, StreamEvent } from "./types";

const HISTORY_LIMIT = 10;
const MAX_PER_MINUTE = 8;
const MAX_PER_DAY = 300;

type Turn = { role: "user" | "assistant"; content: string };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** A API exige papéis alternados começando por "user": normaliza o histórico. */
function normalizeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const turn of turns) {
    const last = out.at(-1);
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else out.push({ ...turn });
  }
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out;
}

function friendlyAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) {
      return "A chave da Anthropic configurada no servidor foi recusada. Verifique ANTHROPIC_API_KEY.";
    }
    if (error.status === 429) return "O limite de requisições da Anthropic foi atingido. Tente novamente em instantes.";
    if (error.status === 529 || (error.status ?? 0) >= 500) {
      return "O serviço da Anthropic está indisponível no momento. Tente novamente em instantes.";
    }
    if (error.status === 404) return "O modelo configurado não está disponível para a chave. Verifique ANTHROPIC_MODEL.";
    if (error.status === 400) return "A requisição ao modelo foi recusada. Tente reformular a pergunta.";
  }
  return "Não foi possível gerar a resposta agora. Tente novamente.";
}

export async function handleChat(input: ChatRequest, requestSignal: AbortSignal): Promise<Response> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return json({ error: "Sessão expirada. Entre novamente." }, 401);
  if (!(WRITE_ROLES as readonly string[]).includes(workspace.role)) {
    return json({ error: "Seu papel neste workspace não permite usar o assistente." }, 403);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "O assistente não está configurado (ANTHROPIC_API_KEY ausente no servidor)." }, 503);
  }

  const supabase = await createClient();

  // Limites de uso por usuário (RLS: só conta as mensagens do próprio usuário)
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [{ count: lastMinute }, { count: lastDay }] = await Promise.all([
    supabase.from("ai_messages").select("*", { count: "exact", head: true }).eq("role", "user").gte("created_at", since(60_000)),
    supabase.from("ai_messages").select("*", { count: "exact", head: true }).eq("role", "user").gte("created_at", since(86_400_000)),
  ]);
  if ((lastMinute ?? 0) >= MAX_PER_MINUTE) {
    return json({ error: "Muitas perguntas em pouco tempo. Aguarde um minuto." }, 429);
  }
  if ((lastDay ?? 0) >= MAX_PER_DAY) {
    return json({ error: "Limite diário de perguntas atingido." }, 429);
  }

  // Conversa (RLS garante que é do usuário)
  let conversationId = input.conversationId;
  let history: Turn[] = [];
  if (conversationId) {
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada." }, 404);

    const { data: previous } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    history = ((previous ?? []) as Turn[]).reverse();
  } else {
    const { data: created, error } = await supabase
      .from("ai_conversations")
      .insert({
        workspace_id: workspace.workspaceId,
        user_id: workspace.userId,
        title: input.message.replace(/\s+/g, " ").slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !created) return json({ error: "Não foi possível iniciar a conversa." }, 500);
    conversationId = created.id as string;
  }

  const { error: userMessageError } = await supabase.from("ai_messages").insert({
    workspace_id: workspace.workspaceId,
    conversation_id: conversationId,
    role: "user",
    content: input.message,
  });
  if (userMessageError) return json({ error: "Não foi possível registrar a pergunta." }, 500);

  // Recuperação de contexto (documentação oficial)
  const lastUserQuestion = [...history].reverse().find((t) => t.role === "user")?.content;
  let sources: RetrievedSource[];
  try {
    sources = await retrieveSources(supabase, input.message, lastUserQuestion);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha na busca." }, 500);
  }

  // O texto completo do trecho vai só para o modelo; o navegador recebe apenas o resumo.
  const publicSources = (list: RetrievedSource[]): Source[] =>
    list.map((s) => ({
      index: s.index,
      title: s.title,
      url: s.url,
      kind: s.kind,
      entryId: s.entryId,
      snippet: s.snippet,
    }));

  const encoder = new TextEncoder();
  const abort = new AbortController();
  requestSignal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      const persistAnswer = async (text: string, finalSources: Source[]) => {
        const { data } = await supabase
          .from("ai_messages")
          .insert({
            workspace_id: workspace.workspaceId,
            conversation_id: conversationId,
            role: "assistant",
            content: text,
            citations: finalSources,
          })
          .select("id")
          .single();
        await supabase
          .from("ai_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        return (data?.id as string | undefined) ?? null;
      };

      try {
        send({ type: "meta", conversationId: conversationId!, sources: publicSources(sources) });

        // Sem nenhuma fonte: não chama o modelo (evita resposta inventada e custo).
        if (sources.length === 0) {
          send({ type: "delta", text: NO_SOURCES_MESSAGE });
          const messageId = await persistAnswer(NO_SOURCES_MESSAGE, []);
          send({ type: "done", messageId, sources: [] });
          return;
        }

        const turns = normalizeTurns([
          ...history,
          { role: "user", content: buildUserTurn(input.message, sources) },
        ]);

        const modelStream = getAnthropicClient().messages.stream(
          {
            model: CHAT_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: SYSTEM_PROMPT,
            messages: turns,
          },
          { signal: abort.signal },
        );

        let text = "";
        for await (const event of modelStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await modelStream.finalMessage();
        if (final.stop_reason === "max_tokens") {
          const note = "\n\n_(Resposta interrompida pelo limite de tamanho. Peça para continuar.)_";
          text += note;
          send({ type: "delta", text: note });
        }

        const finalSources = markCitedSources(text, publicSources(sources));
        const messageId = await persistAnswer(text, finalSources);
        send({ type: "done", messageId, sources: finalSources });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("[assistente] falha ao gerar resposta:", error instanceof Error ? error.message : error);
          send({ type: "error", message: friendlyAnthropicError(error) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // já fechado (cliente desconectou)
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
