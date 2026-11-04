"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import { saveRequest } from "../actions";
import {
  BODY_TYPES,
  HTTP_METHODS,
  READ_ONLY_METHODS,
  type BodyType,
  type CollectionWithRequests,
  type ExecuteResponse,
  type HistoryItem,
  type HttpMethod,
  type KeyValue,
  type SavedRequest,
} from "../schemas";
import { KeyValueEditor } from "./key-value-editor";
import { ResponseView } from "./response-view";
import { TesterSidebar } from "./tester-sidebar";

const BODY_LABELS: Record<BodyType, string> = {
  none: "Sem corpo",
  json: "JSON",
  xml: "XML",
  text: "Texto",
  form: "Formulário (urlencoded)",
};

const fieldClass =
  "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

function guessBodyType(body: string | null): BodyType {
  if (!body) return "none";
  const t = body.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.startsWith("<")) return "xml";
  return "text";
}

export function TesterWorkspace({
  environments,
  collections,
  history,
  initialMethod,
  initialPath,
}: {
  environments: EnvironmentSummary[];
  collections: CollectionWithRequests[];
  history: HistoryItem[];
  initialMethod?: HttpMethod;
  initialPath?: string;
}) {
  const router = useRouter();
  const activeEnvs = environments.filter((e) => e.is_active);

  const [envId, setEnvId] = useState(activeEnvs[0]?.id ?? "");
  const [method, setMethod] = useState<HttpMethod>(initialMethod ?? "GET");
  const [path, setPath] = useState(initialPath ?? "/");
  const [query, setQuery] = useState<KeyValue[]>([]);
  const [headers, setHeaders] = useState<KeyValue[]>([]);
  const [bodyType, setBodyType] = useState<BodyType>("none");
  const [body, setBody] = useState("");
  const [reqTab, setReqTab] = useState<"params" | "headers" | "body">("params");

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCollection, setSaveCollection] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const env = environments.find((e) => e.id === envId);
  const writeBlocked =
    !!env && !env.allow_write_methods && !READ_ONLY_METHODS.includes(method);

  async function send() {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/tester/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentId: envId,
          method,
          path: path.trim() || "/",
          query,
          headers,
          bodyType,
          body: bodyType === "none" ? undefined : body,
        }),
      });

      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) {
        setError("Sessão expirada. Recarregue a página e entre novamente.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível executar a requisição.");
        return;
      }
      setResponse(data as ExecuteResponse);
      router.refresh(); // atualiza o histórico
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  function loadSaved(request: SavedRequest) {
    setMethod(request.method);
    setPath(request.path);
    setQuery(request.query ?? []);
    setHeaders(request.headers ?? []);
    setBodyType(request.body_type);
    setBody(request.body ?? "");
    if (request.environment_id && environments.some((e) => e.id === request.environment_id)) {
      setEnvId(request.environment_id);
    }
    setResponse(null);
    setError(null);
  }

  function loadHistory(item: HistoryItem) {
    try {
      const url = new URL(item.url);
      const itemEnv = environments.find((e) => e.id === item.environment_id);
      const basePath = itemEnv ? new URL(itemEnv.base_url).pathname.replace(/\/+$/, "") : "";
      const relative = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;

      setPath(relative || "/");
      setQuery([...url.searchParams.entries()].map(([key, value]) => ({ key, value: value === "***" ? "" : value, enabled: true })));
    } catch {
      setPath("/");
      setQuery([]);
    }
    setMethod((HTTP_METHODS as readonly string[]).includes(item.method) ? (item.method as HttpMethod) : "GET");
    setHeaders(
      Object.entries(item.request_headers ?? {})
        .filter(([k, v]) => v !== "***" && !["accept", "user-agent", "content-type"].includes(k.toLowerCase()))
        .map(([key, value]) => ({ key, value, enabled: true })),
    );
    setBody(item.request_body ?? "");
    setBodyType(guessBodyType(item.request_body));
    if (item.environment_id && environments.some((e) => e.id === item.environment_id)) {
      setEnvId(item.environment_id);
    }
    setResponse(null);
    setError(null);
  }

  async function save() {
    setSaveMessage(null);
    const result = await saveRequest({
      name: saveName,
      collectionId: saveCollection || undefined,
      newCollectionName: saveCollection ? undefined : newCollection,
      environmentId: envId || null,
      method,
      path: path.trim() || "/",
      query,
      headers,
      bodyType,
      body: bodyType === "none" ? undefined : body,
    });
    setSaveMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setSaveName("");
      setNewCollection("");
      router.refresh();
    }
  }

  if (environments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
        Nenhum ambiente cadastrado. Cadastre um ambiente Fluig em{" "}
        <Link href="/configuracoes" className="text-accent hover:underline">
          Configurações
        </Link>{" "}
        para começar.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <TesterSidebar
        collections={collections}
        history={history}
        onLoadSaved={loadSaved}
        onLoadHistory={loadHistory}
        onChanged={() => router.refresh()}
      />

      <div className="min-w-0 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="env">
                Ambiente
              </label>
              <select
                id="env"
                value={envId}
                onChange={(e) => setEnvId(e.target.value)}
                className={cn(fieldClass, "min-w-0 md:w-44")}
              >
                {environments.map((e) => (
                  <option key={e.id} value={e.id} disabled={!e.is_active}>
                    {e.name}
                    {e.allow_write_methods ? "" : " (leitura)"}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="method">
                Método HTTP
              </label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className={cn(fieldClass, "w-28 font-mono font-medium")}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="hidden max-w-[40%] truncate font-mono text-xs text-muted lg:block" title={env?.base_url}>
                {env?.base_url}
              </span>
              <label className="sr-only" htmlFor="path">
                Caminho
              </label>
              <input
                id="path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/api/public/..."
                className={cn(fieldClass, "min-w-0 flex-1 font-mono")}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || !envId || writeBlocked}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                Enviar
              </button>
              <button
                type="button"
                onClick={() => setSaveOpen((v) => !v)}
                aria-expanded={saveOpen}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
              >
                <Save className="size-4" aria-hidden />
                Salvar
              </button>
            </div>
          </div>

          {writeBlocked && (
            <p role="alert" className="text-xs text-danger">
              O ambiente &quot;{env?.name}&quot; está em modo somente leitura. Habilite métodos de escrita em
              Configurações para usar {method}.
            </p>
          )}

          {saveOpen && (
            <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="save-name" className="text-xs font-medium">Nome da requisição</label>
                  <input id="save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} className={cn(fieldClass, "w-full")} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="save-collection" className="text-xs font-medium">Coleção</label>
                  <select id="save-collection" value={saveCollection} onChange={(e) => setSaveCollection(e.target.value)} className={cn(fieldClass, "w-full")}>
                    <option value="">Nova coleção...</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {!saveCollection && (
                  <div className="space-y-1">
                    <label htmlFor="save-new" className="text-xs font-medium">Nome da nova coleção</label>
                    <input id="save-new" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} className={cn(fieldClass, "w-full")} />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">
                Não salve tokens ou senhas em headers: as credenciais do ambiente já são aplicadas automaticamente.
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void save()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">
                  Salvar na coleção
                </button>
                {saveMessage && (
                  <span role="status" className={cn("text-xs", saveMessage.ok ? "text-success" : "text-danger")}>
                    {saveMessage.text}
                  </span>
                )}
              </div>
            </div>
          )}

          <div role="tablist" aria-label="Configuração da requisição" className="flex gap-1 border-b border-border">
            {(
              [
                ["params", `Parâmetros (${query.filter((q) => q.enabled && q.key).length})`],
                ["headers", `Headers (${headers.filter((h) => h.enabled && h.key).length})`],
                ["body", "Corpo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={reqTab === id}
                onClick={() => setReqTab(id)}
                className={cn(
                  "px-3 py-1.5 text-sm text-muted hover:text-foreground",
                  reqTab === id && "border-b-2 border-accent text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {reqTab === "params" && (
            <KeyValueEditor label="Parâmetros de query" rows={query} onChange={setQuery} keyPlaceholder="parâmetro" />
          )}
          {reqTab === "headers" && (
            <KeyValueEditor label="Headers" rows={headers} onChange={setHeaders} keyPlaceholder="Header" />
          )}
          {reqTab === "body" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="body-type" className="text-xs font-medium">Tipo</label>
                <select id="body-type" value={bodyType} onChange={(e) => setBodyType(e.target.value as BodyType)} className={cn(fieldClass, "py-1")}>
                  {BODY_TYPES.map((t) => (
                    <option key={t} value={t}>{BODY_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              {bodyType !== "none" && (
                <>
                  <label htmlFor="body" className="sr-only">Corpo da requisição</label>
                  <textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    placeholder={bodyType === "json" ? '{\n  "chave": "valor"\n}' : bodyType === "xml" ? "<root>...</root>" : ""}
                    className={cn(fieldClass, "w-full font-mono text-xs")}
                  />
                  {["GET", "HEAD"].includes(method) && (
                    <p className="text-xs text-muted">Requisições {method} não enviam corpo.</p>
                  )}
                </>
              )}
            </div>
          )}
        </form>

        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {response && <ResponseView response={response} />}
      </div>
    </div>
  );
}
