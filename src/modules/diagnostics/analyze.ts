import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { WRITE_ROLES, getActiveWorkspace } from "@/lib/workspace";
import { CHAT_MODEL, getAnthropicClient } from "@/modules/assistant/anthropic";
import { markCitedSources } from "@/modules/assistant/citations";
import { retrieveSources, type RetrievedSource } from "@/modules/assistant/retrieve";
import type { Source } from "@/modules/assistant/types";
import { AUTH_LABELS, type AuthType } from "@/modules/environments/constants";
import { DIAGNOSTIC_SYSTEM_PROMPT, buildDiagnosticTurn, buildFallbackDiagnosis } from "./prompt";
import { redactSecrets } from "./redact";
import { buildSearchQuery, detectSignals, inferCategory, type Category } from "./signals";
import type { DiagnoseRequest, DiagnosticEvent } from "./types";

const MAX_PER_MINUTE = 5;
const MAX_PER_DAY = 100;
/** O formato fixo do diagnóstico (6 seções) é mais longo que uma resposta de chat. */
const DIAGNOSTIC_MAX_TOKENS = 4096;
const MAX_HISTORY_BODY = 1500;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function friendlyAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) return "A chave da Anthropic configurada no servidor foi recusada.";
    if (error.status === 429) return "O limite de requisições da Anthropic foi atingido. Tente novamente em instantes.";
    if (error.status === 529 || (error.status ?? 0) >= 500) return "O serviço da Anthropic está indisponível no momento.";
    if (error.status === 404) return "O modelo configurado não está disponível para a chave. Verifique ANTHROPIC_MODEL.";
  }
  return "Não foi possível gerar o diagnóstico agora. Tente novamente.";
}

const stripBody = (text: string | null) =>
  text ? redactSecrets(text.slice(0, MAX_HISTORY_BODY)).text : null;

export async function handleDiagnose(input: DiagnoseRequest, requestSignal: AbortSignal): Promise<Response> {
  const workspace = await getActiveWorkspace();
  if (!workspace) return json({ error: "Sessão expirada. Entre novamente." }, 401);
  if (!(WRITE_ROLES as readonly string[]).includes(workspace.role)) {
    return json({ error: "Seu papel neste workspace não permite gerar diagnósticos." }, 403);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "O diagnóstico não está configurado (ANTHROPIC_API_KEY ausente no servidor)." }, 503);
  }

  const supabase = await createClient();

  // Limites de uso por usuário (RLS: conta só os próprios registros)
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [{ count: lastMinute }, { count: lastDay }] = await Promise.all([
    supabase.from("diagnostics").select("*", { count: "exact", head: true }).gte("created_at", since(60_000)),
    supabase.from("diagnostics").select("*", { count: "exact", head: true }).gte("created_at", since(86_400_000)),
  ]);
  if ((lastMinute ?? 0) >= MAX_PER_MINUTE) return json({ error: "Muitos diagnósticos em pouco tempo. Aguarde um minuto." }, 429);
  if ((lastDay ?? 0) >= MAX_PER_DAY) return json({ error: "Limite diário de diagnósticos atingido." }, 429);

  // 1. Segredos ocultos ANTES de qualquer outro uso do texto
  const redacted = redactSecrets(input.errorText);
  let redactions = redacted.count;

  // 2. Evidências anexas (ambiente e requisição do histórico), sempre via RLS
  const attached: string[] = [];
  const attachedForModel: { environment?: string; history?: string } = {};
  let evidenceText = "";

  if (input.environmentId) {
    const { data: env } = await supabase
      .from("fluig_environments")
      .select("name, base_url, auth_type, allow_write_methods")
      .eq("id", input.environmentId)
      .maybeSingle();
    if (env) {
      let host = env.base_url as string;
      try {
        host = new URL(env.base_url as string).host;
      } catch {
        // mantém como está
      }
      const authLabel = AUTH_LABELS[env.auth_type as AuthType] ?? env.auth_type;
      attachedForModel.environment = `Nome: ${env.name}\nHost: ${host}\nAutenticação cadastrada: ${authLabel}\nMétodos de escrita: ${env.allow_write_methods ? "liberados" : "bloqueados (somente leitura)"}`;
      attached.push(`ambiente "${env.name}" (${authLabel})`);
    }
  }

  if (input.historyId) {
    const { data: h } = await supabase
      .from("request_history")
      .select("kind, method, url, status_code, duration_ms, error, request_body, response_body, created_at")
      .eq("id", input.historyId)
      .maybeSingle();
    if (h) {
      const reqBody = stripBody(h.request_body as string | null);
      const resBody = stripBody(h.response_body as string | null);
      const urlRedacted = redactSecrets(h.url as string);
      redactions += urlRedacted.count;
      attachedForModel.history = [
        `Tipo: ${h.kind === "soap" ? "SOAP" : "REST"}`,
        `Método e URL: ${h.method} ${urlRedacted.text}`,
        `Status HTTP: ${h.status_code ?? "sem resposta"}`,
        `Duração: ${h.duration_ms ?? "?"} ms`,
        h.error ? `Erro registrado: ${h.error}` : null,
        reqBody ? `Corpo da requisição (redigido, início):\n${reqBody}` : null,
        resBody ? `Corpo da resposta (redigido, início):\n${resBody}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      evidenceText = `${h.status_code ? `HTTP ${h.status_code}` : ""} ${h.error ?? ""} ${resBody ?? ""}`;
      attached.push(`requisição do histórico (${h.method} → ${h.status_code ?? "sem resposta"})`);
    }
  }

  // 3. Sinais e categoria
  const analysisText = `${redacted.text}\n${evidenceText}`;
  const signals = detectSignals(analysisText);
  const category: Category = input.category === "auto" ? inferCategory(signals) : input.category;

  // 4. Recuperação na documentação oficial
  let sources: RetrievedSource[];
  try {
    sources = await retrieveSources(supabase, buildSearchQuery(analysisText, signals, category) || redacted.text.slice(0, 300));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha na busca." }, 500);
  }

  const publicSources = (list: RetrievedSource[]): Source[] =>
    list.map((s) => ({ index: s.index, title: s.title, url: s.url, kind: s.kind, entryId: s.entryId, snippet: s.snippet }));

  const encoder = new TextEncoder();
  const abort = new AbortController();
  requestSignal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DiagnosticEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      const persist = async (markdown: string, finalSources: Source[]) => {
        const { data } = await supabase
          .from("diagnostics")
          .insert({
            workspace_id: workspace.workspaceId,
            user_id: workspace.userId,
            category,
            input_text: redacted.text,
            result: {
              markdown,
              signals,
              redactions,
              environmentId: input.environmentId ?? null,
              historyId: input.historyId ?? null,
              attached,
            },
            sources: finalSources,
          })
          .select("id")
          .single();
        return (data?.id as string | undefined) ?? null;
      };

      try {
        send({ type: "meta", category, signals, sources: publicSources(sources), redactions, attached });

        // Pouca evidência (texto curto, sem sinais, nada anexado) ou sem documentação
        // correspondente: não chama o modelo (evita causa inventada e custo desnecessário).
        const weakEvidence = signals.length === 0 && attached.length === 0 && redacted.text.length < 80;
        if (sources.length === 0 || weakEvidence) {
          const markdown = buildFallbackDiagnosis(signals, attached, weakEvidence ? "pouca-evidencia" : "sem-documentacao");
          send({ type: "delta", text: markdown });
          const diagnosticId = await persist(markdown, []);
          send({ type: "done", diagnosticId, sources: [] });
          return;
        }

        const modelStream = getAnthropicClient().messages.stream(
          {
            model: CHAT_MODEL,
            max_tokens: DIAGNOSTIC_MAX_TOKENS,
            system: DIAGNOSTIC_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: buildDiagnosticTurn({ errorText: redacted.text, sources, signals, attached: attachedForModel }),
              },
            ],
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
          const note = "\n\n_(Diagnóstico interrompido pelo limite de tamanho.)_";
          text += note;
          send({ type: "delta", text: note });
        }

        const finalSources = markCitedSources(text, publicSources(sources));
        const diagnosticId = await persist(text, finalSources);
        send({ type: "done", diagnosticId, sources: finalSources });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("[diagnostico] falha ao gerar:", error instanceof Error ? error.message : error);
          send({ type: "error", message: friendlyAnthropicError(error) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // cliente desconectou
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
