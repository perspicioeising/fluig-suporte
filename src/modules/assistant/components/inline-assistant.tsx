"use client";

import { useEffect, useRef } from "react";
import { Loader2, Send, Sparkles, Square } from "lucide-react";
import { useChatStream } from "../use-chat";
import { Markdown } from "./markdown";
import { SourcesList } from "./sources-list";

/**
 * Assistente embutido (no painel lateral do catálogo): conversa sobre a API aberta,
 * sem a lista lateral de conversas. A conversa é gravada normalmente e aparece em /assistente.
 */
export function InlineAssistant({ suggestions }: { suggestions: string[] }) {
  const { messages, streaming, error, send, stop } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function submit() {
    const text = inputRef.current?.value ?? "";
    if (!text.trim()) return;
    void send(text);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite" aria-busy={streaming}>
        {messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">
              Pergunte sobre esta API com base na documentação oficial. As respostas citam as fontes.
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="block w-full rounded-md border border-border bg-surface-2 p-2.5 text-left text-xs hover:border-accent"
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
                <p className="max-w-[90%] rounded-lg bg-accent/15 px-3 py-2 text-sm whitespace-pre-wrap">{m.content}</p>
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
        <p role="alert" className="mx-3 mb-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-border p-3"
      >
        <label htmlFor="inline-assistant-input" className="sr-only">Pergunta</label>
        <textarea
          id="inline-assistant-input"
          ref={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Pergunte sobre esta API... (Enter envia)"
          className="min-h-[3rem] w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted"
        />
        <div className="mt-2 flex justify-end">
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Square className="size-4" aria-hidden />
              Parar
            </button>
          ) : (
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              <Send className="size-4" aria-hidden />
              Enviar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export { Sparkles };
