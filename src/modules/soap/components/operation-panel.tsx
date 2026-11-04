"use client";

import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Send, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import { ResponseView } from "@/modules/tester/components/response-view";
import {
  buildCurlSample,
  buildJavaSample,
  buildJavaScriptSample,
  buildSoapEnvelope,
  ENV_PASSWORD,
  ENV_USERNAME,
  prettyXml,
} from "../envelope";
import { resolveEndpoint } from "../endpoint";
import { isReadOnlySoapName } from "../guard";
import type { SoapExecuteResponse, SoapOperationRecord } from "../schemas";
import { ParamTree } from "./param-tree";

const fieldClass =
  "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

export function OperationPanel({
  op,
  environments,
}: {
  op: SoapOperationRecord;
  environments: EnvironmentSummary[];
}) {
  const activeEnvs = environments.filter((e) => e.is_active);
  const [envId, setEnvId] = useState(activeEnvs[0]?.id ?? "");
  const [envelope, setEnvelope] = useState(() => buildSoapEnvelope(op));
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SoapExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState<"curl" | "js" | "java">("curl");

  const env = environments.find((e) => e.id === envId);
  const endpoint = resolveEndpoint(env?.base_url, op.endpoint);
  const writeBlocked = !!env && !env.allow_write_methods && !isReadOnlySoapName(op.name);
  const usesPlaceholders = envelope.includes(ENV_USERNAME) || envelope.includes(ENV_PASSWORD);

  const sampleCode = useMemo(() => {
    const input = { endpoint, soapAction: op.soapAction, soapVersion: op.soapVersion, envelope };
    return sample === "curl"
      ? buildCurlSample(input)
      : sample === "js"
        ? buildJavaScriptSample(input)
        : buildJavaSample(input);
  }, [sample, endpoint, op.soapAction, op.soapVersion, envelope]);

  async function send() {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/soap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId: envId, operationId: op.id, envelope }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) {
        setError("Sessão expirada. Recarregue a página e entre novamente.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível executar a chamada.");
        return;
      }
      setResponse(data as SoapExecuteResponse);
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{op.name}</h2>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">
            SOAP {op.soapVersion}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">
            {op.style}/{op.use}
          </span>
        </div>
        {op.documentation && <p className="text-sm text-muted">{op.documentation}</p>}
        <dl className="grid gap-x-6 gap-y-1 pt-1 text-xs @md/main:grid-cols-2">
          <div className="flex gap-2"><dt className="text-muted">Serviço:</dt><dd className="font-mono">{op.service}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">Porta:</dt><dd className="font-mono">{op.port}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">SOAPAction:</dt><dd className="font-mono break-all">{op.soapAction || "(vazio)"}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">Endpoint:</dt><dd className="font-mono break-all">{endpoint || "(não declarado)"}</dd></div>
        </dl>
      </header>

      <div className="grid gap-3 @xl/main:grid-cols-2">
        <ParamTree title="Entrada" shape={op.input} />
        <ParamTree title="Saída" shape={op.output} />
      </div>
      {op.faults.length > 0 && (
        <p className="text-xs text-muted">Faults declarados: {op.faults.join(", ")}</p>
      )}

      <section aria-label="Envelope da requisição" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="soap-env" className="sr-only">Ambiente</label>
          <select id="soap-env" value={envId} onChange={(e) => setEnvId(e.target.value)} className={cn(fieldClass, "min-w-0 @xl/main:w-56")}>
            {environments.length === 0 && <option value="">Nenhum ambiente</option>}
            {environments.map((e) => (
              <option key={e.id} value={e.id} disabled={!e.is_active}>
                {e.name}{e.allow_write_methods ? "" : " (leitura)"}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !envId || writeBlocked}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Enviar
          </button>
          <button type="button" onClick={() => setEnvelope(prettyXml(envelope))} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">
            <Wand2 className="size-4" aria-hidden />
            Formatar
          </button>
          <button type="button" onClick={() => setEnvelope(buildSoapEnvelope(op))} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">
            <RotateCcw className="size-4" aria-hidden />
            Restaurar exemplo
          </button>
        </div>

        {writeBlocked && (
          <p role="alert" className="text-xs text-danger">
            &quot;{op.name}&quot; não é reconhecida como consulta e o ambiente &quot;{env?.name}&quot; está em modo
            somente leitura. Habilite métodos de escrita em Configurações para executá-la.
          </p>
        )}
        {usesPlaceholders && (
          <p className="text-xs text-muted">
            Os marcadores <code className="font-mono">{ENV_USERNAME}</code> e{" "}
            <code className="font-mono">{ENV_PASSWORD}</code> são substituídos <strong>no servidor</strong> pelas
            credenciais Basic do ambiente. Elas nunca chegam ao navegador nem ao histórico.
          </p>
        )}

        <label htmlFor="soap-envelope" className="sr-only">Envelope SOAP</label>
        <textarea
          id="soap-envelope"
          value={envelope}
          onChange={(e) => setEnvelope(e.target.value)}
          rows={16}
          spellCheck={false}
          className={cn(fieldClass, "w-full font-mono text-xs")}
        />
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {response?.fault && (
        <div role="alert" className="space-y-1 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">SOAP Fault{response.fault.code ? `: ${response.fault.code}` : ""}</p>
          <p>{response.fault.message || "(sem mensagem)"}</p>
          {response.fault.detail && <p className="text-xs text-muted">{response.fault.detail}</p>}
        </div>
      )}
      {response && <ResponseView response={response} />}

      <section aria-label="Exemplos de consumo" className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <div role="tablist" aria-label="Linguagem" className="flex gap-1 border-b border-border">
          {(
            [
              ["curl", "cURL"],
              ["js", "JavaScript"],
              ["java", "Java"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={sample === id}
              onClick={() => setSample(id)}
              className={cn(
                "px-3 py-1.5 text-sm text-muted hover:text-foreground",
                sample === id && "border-b-2 border-accent text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Gerado a partir do envelope acima. Troque <code className="font-mono">SEU_USUARIO</code> e{" "}
          <code className="font-mono">SUA_SENHA</code> pelas credenciais reais.
        </p>
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap break-words">
          <code>{sampleCode}</code>
        </pre>
      </section>
    </div>
  );
}
