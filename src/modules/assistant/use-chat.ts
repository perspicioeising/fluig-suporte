"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, StreamEvent } from "./types";

type UiMessage = ChatMessage & { pending?: boolean };

export type ChatStream = {
  messages: UiMessage[];
  streaming: boolean;
  error: string | null;
  conversationId: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Novo id de conversa criado nesta sessão (para quem quer atualizar uma lista). */
  onConversationCreated?: (id: string, title: string) => void;
};

/**
 * Consome o stream NDJSON de /api/assistant/chat. Compartilhado entre a tela do
 * Assistente e o painel embutido no catálogo, para o comportamento ser idêntico.
 */
export function useChatStream(options?: {
  initialMessages?: ChatMessage[];
  initialConversationId?: string | null;
  onConversationCreated?: (id: string, title: string) => void;
}): ChatStream {
  const [messages, setMessages] = useState<UiMessage[]>(options?.initialMessages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(options?.initialConversationId ?? null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setError(null);
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      setError(null);
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
      const currentConversation = conversationId;

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: currentConversation ?? undefined, message: question }),
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

        const handle = (event: StreamEvent) => {
          if (event.type === "meta") {
            update({ citations: event.sources });
            if (!currentConversation) {
              setConversationId(event.conversationId);
              options?.onConversationCreated?.(event.conversationId, question.slice(0, 80));
            }
          } else if (event.type === "delta") {
            append(event.text);
          } else if (event.type === "done") {
            update({ citations: event.sources, pending: false, id: event.messageId ?? assistantId });
          } else if (event.type === "error") {
            setError(event.message);
            setMessages((prev) =>
              prev
                .filter((m) => !(m.id === assistantId && m.content.trim() === ""))
                .map((m) => (m.id === assistantId ? { ...m, pending: false } : m)),
            );
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
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
    },
    [conversationId, streaming, options],
  );

  return { messages, streaming, error, conversationId, send, stop, reset };
}
