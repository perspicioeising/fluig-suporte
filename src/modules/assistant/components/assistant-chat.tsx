"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquarePlus, Send, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteConversation } from "../actions";
import type { ChatMessage, ConversationSummary, Source, StreamEvent } from "../types";
import { Markdown } from "./markdown";
import { SourcesList } from "./sources-list";

const SUGGESTIONS = [
  "Como autenticar na API pública do Fluig com OAuth 1.0a?",
  "O que faz o método getAvailableDatasets do ECMDatasetService?",
  "Quais APIs REST posso usar para trabalhar com formulários?",
  "Mostre um exemplo em JavaScript chamando a API pública para obter o usuário atual.",
];

type UiMessage = ChatMessage & { pending?: boolean };

export function AssistantChat({
  initialConversationId,
  initialMessages,
  initialConversations,
  initialInput = "",
}: {
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
  initialConversations: ConversationSummary[];
  initialInput?: string;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setError(null);
    setStreaming(false);
    window.history.replaceState(null, "", "/assistente");
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;

    setError(null);
    setInput("");
    setStreaming(true);

    const stamp = Date.now();
    const assistantId = `tmp-assistant-${stamp}`;
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: `tmp-user-${stamp}`, role: "user", content: question, citations: [], created_at: now },
      { id: assistantId, role: "assistant", content: "", citations: [], created_at: now, pending: true },
    ]);

    const update = (patch: Partial<UiMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    const append = (chunk: string) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)));
    const dropPlaceholder = () => setMessages((prev) => prev.filter((m) => m.id !== assistantId));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: question }),
        signal: controller.signal,
      });

      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || (!res.ok && !type.includes("json"))) {
        setError("Sessão expirada. Recarregue a página e entre novamente.");
        dropPlaceholder();
        return;
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível obter a resposta.");
        dropPlaceholder();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sources: Source[] = [];

      const handle = (event: StreamEvent) => {
        if (event.type === "meta") {
          sources = event.sources;
          update({ citations: event.sources });
          if (!conversationId) {
            setConversationId(event.conversationId);
            setConversations((prev) => [
              { id: event.conversationId, title: question.slice(0, 80), updated_at: new Date().toISOString() },
              ...prev,
            ]);
            window.history.replaceState(null, "", `/assistente?c=${event.conversationId}`);
          }
        } else if (event.type === "delta") {
          append(event.text);
        } else if (event.type === "done") {
          sources = event.sources;
          update({ citations: sources, pending: false, id: event.messageId ?? assistantId });
        } else if (event.type === "error") {
          setError(event.message);
          setMessages((prev) =>
            prev.filter((m) => !(m.id === assistantId && m.content.trim() === "")).map((m) =>
              m.id === assistantId ? { ...m, pending: false } : m,
            ),
          );
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as StreamEvent);
        }
      }
      update({ pending: false });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        update({ pending: false });
      } else {
        setError("Falha de comunicação com o servidor.");
        dropPlaceholder();
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="grid gap-4 @2xl/main:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Conversas" className="space-y-2 rounded-lg border border-border bg-surface p-3 @2xl/main:max-h-[calc(100vh-12rem)] @2xl/main:overflow-auto">
        <button
          type="button"
          onClick={newConversation}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
        >
          <MessageSquarePlus className="size-4 text-accent" aria-hidden />
          Nova conversa
        </button>
        {conversations.length === 0 ? (
          <p className="px-1 text-xs text-muted">Nenhuma conversa ainda.</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <Link
                  href={`/assistente?c=${c.id}`}
                  aria-current={c.id === conversationId ? "page" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded px-2 py-1.5 text-sm hover:bg-surface-2",
                    c.id === conversationId && "bg-surface-2 text-accent",
                  )}
                  title={c.title ?? undefined}
                >
                  {c.title || "Sem título"}
                </Link>
                <form
                  action={async (formData) => {
                    await deleteConversation(formData);
                    setConversations((prev) => prev.filter((x) => x.id !== c.id));
                    if (c.id === conversationId) newConversation();
                  }}
                >
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    aria-label={`Excluir conversa ${c.title ?? ""}`}
                    className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section aria-label="Conversa" className="flex min-w-0 flex-col rounded-lg border border-border bg-surface">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 @2xl/main:max-h-[calc(100vh-18rem)] @2xl/main:min-h-[24rem]" aria-live="polite" aria-busy={streaming}>
          {messages.length === 0 ? (
            <div className="space-y-4 py-6">
              <div>
                <h2 className="text-lg font-semibold">Como posso ajudar?</h2>
                <p className="text-sm text-muted">
                  Respondo com base na documentação oficial do Fluig importada (REST, SOAP, SDK e conceitos),
                  citando as fontes. Quando não houver informação suficiente, eu aviso.
                </p>
              </div>
              <div className="grid gap-2 @md/main:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-md border border-border bg-surface-2 p-3 text-left text-sm hover:border-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-accent/15 px-3 py-2 text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <div key={m.id} className="space-y-2">
                  {m.content ? (
                    <Markdown text={m.content} sources={m.citations} />
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Consultando a documentação...
                    </p>
                  )}
                  {!m.pending && <SourcesList sources={m.citations} />}
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="assistant-input" className="sr-only">
              Pergunta
            </label>
            <textarea
              id="assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Pergunte sobre APIs, métodos, erros ou peça um exemplo de código... (Enter envia, Shift+Enter quebra linha)"
              className="min-h-[3rem] flex-1 resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
              >
                <Square className="size-4" aria-hidden />
                Parar
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Send className="size-4" aria-hidden />
                Enviar
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            O assistente pode errar. Confira as fontes citadas antes de aplicar em produção.
          </p>
        </form>
      </section>
    </div>
  );
}
