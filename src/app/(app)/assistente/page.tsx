import { Suspense } from "react";
import * as z from "zod";
import type { Metadata } from "next";
import { getConversationMessages, listConversations } from "@/modules/assistant/queries";
import { AssistantChat } from "@/modules/assistant/components/assistant-chat";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Assistente IA" };

type RawSearchParams = Record<string, string | string[] | undefined>;

export default function AssistantPage({ searchParams }: PageProps<"/assistente">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assistente IA</h1>
        <p className="text-sm text-muted">
          Perguntas sobre APIs REST, Webservices SOAP e SDK do Fluig, com respostas fundamentadas na documentação
          oficial e fontes citadas.
        </p>
      </div>

      <Suspense
        fallback={
          <LoadingState label="Carregando..." />
        }
      >
        <AssistantContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function AssistantContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const param = Array.isArray(raw.c) ? raw.c[0] : raw.c;
  const conversationId = z.uuid().safeParse(param).success ? (param as string) : null;

  // ?ask=... pré-preenche a pergunta (vem do Construtor); nunca é enviada automaticamente.
  const askParam = Array.isArray(raw.ask) ? raw.ask[0] : raw.ask;
  const initialInput = (askParam ?? "").slice(0, 500);

  const conversations = await listConversations();
  const activeId = conversationId && conversations.some((c) => c.id === conversationId) ? conversationId : null;
  const messages = activeId ? await getConversationMessages(activeId) : [];

  return (
    <AssistantChat
      key={activeId ?? `new-${initialInput}`}
      initialConversationId={activeId}
      initialMessages={messages}
      initialConversations={conversations}
      initialInput={initialInput}
    />
  );
}
