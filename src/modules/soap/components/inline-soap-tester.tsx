"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, Send, Stethoscope, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import { ResponseView } from "@/modules/tester/components/response-view";
import { buildSoapEnvelope, ENV_PASSWORD, ENV_USERNAME, prettyXml } from "../envelope";
import { resolveEndpoint } from "../endpoint";
import { isReadOnlySoapName } from "../guard";
import type { SoapExecuteResponse, SoapOperationRecord } from "../schemas";
import { InlineWsdlImport } from "./inline-wsdl-import";

const fieldClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

/**
 * Teste SOAP embutido no detalhe do catálogo. Só é possível quando o WSDL da operação foi
 * importado (endpoint, SOAPAction e namespace exatos vêm dele). Sem WSDL, orienta a importar.
 * Reaproveita a rota /api/soap/execute, o ResponseView e a guarda de escrita.
 */
export function InlineSoapTester({
  op,
  wsdlId,
  serviceName,
  environments,
  onDiagnose,
}: {
  /** Operação do WSDL importado; null quando não há WSDL para esta entrada. */
  op: SoapOperationRecord | null;
  wsdlId: string | null;
  /** Nome do serviço da entrada (ex.: ECMBusinessPeriodService), para importar o WSDL dele. */
  serviceName: string;
  environments: EnvironmentSummary[];
  onDiagnose?: (summary: string, environmentId: string) => void;
}) {
  const activeEnvs = environments.filter((e) => e.is_active);
  const [envId, setEnvId] = useState(activeEnvs[0]?.id ?? "");
  const [envelope, setEnvelope] = useState(() => (op ? buildSoapEnvelope(op) : ""));
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SoapExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sem WSDL importado: oferece importar o WSDL ali mesmo (do ambiente ou por arquivo).
  // Ao importar, a página revalida e esta aba passa a receber `op`, mostrando o testador.
  if (!op) {
    return <InlineWsdlImport serviceName={serviceName} environments={environments} />;
  }

  const env = environments.find((e) => e.id === envId);
  const endpoint = resolveEndpoint(env?.base_url, op.endpoint);
  const writeBlocked = !!env && !env.allow_write_methods && !isReadOnlySoapName(op.name);
  const usesPlaceholders = envelope.includes(ENV_USERNAME) || envelope.includes(ENV_PASSWORD);

  async function send() {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/soap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId: envId, operationId: op!.id, envelope }),
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

  function diagnose() {
    if (!response || !onDiagnose) return;
    const status = response.status === null ? "sem resposta" : `${response.status} ${response.statusText}`;
    const lines = [`SOAP ${op!.name} (${endpoint}) retornou ${status}.`];
    if (response.fault) lines.push(`SOAP Fault: ${response.fault.code ?? ""} ${response.fault.message ?? ""}`.trim());
    if (response.error) lines.push(`Erro: ${response.error}`);
    if (response.body?.trim()) lines.push("", "Resposta:", response.body.slice(0, 4000));
    onDiagnose(lines.join("\n"), envId);
  }

  const isError = response && (response.status === null || response.status >= 400 || !!response.fault);

  return (
    <section aria-label="Testar SOAP" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <dl className="grid gap-x-6 gap-y-1 text-xs @md/main:grid-cols-2">
        <div className="flex gap-2"><dt className="text-muted">SOAPAction:</dt><dd className="font-mono break-all">{op.soapAction || "(vazio)"}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">Endpoint:</dt><dd className="font-mono break-all">{endpoint || "(não declarado)"}</dd></div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="inline-soap-env" className="sr-only">Ambiente</label>
        <select id="inline-soap-env" value={envId} onChange={(e) => setEnvId(e.target.value)} className={cn(fieldClass, "min-w-0 @xl/main:w-56")}>
          {activeEnvs.length === 0 && <option value="">Nenhum ambiente</option>}
          {activeEnvs.map((e) => (
            <option key={e.id} value={e.id}>
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
          <code className="font-mono">{ENV_USERNAME}</code> e <code className="font-mono">{ENV_PASSWORD}</code> são
          substituídos <strong>no servidor</strong> pelas credenciais Basic do ambiente; nunca vão ao navegador.
        </p>
      )}

      <label htmlFor="inline-soap-envelope" className="sr-only">Envelope SOAP</label>
      <textarea
        id="inline-soap-envelope"
        value={envelope}
        onChange={(e) => setEnvelope(e.target.value)}
        rows={14}
        spellCheck={false}
        className={cn(fieldClass, "w-full font-mono text-xs")}
      />
      <p className="text-xs text-muted">
        Precisa da árvore de parâmetros completa?{" "}
        <Link href={wsdlId ? `/soap?wsdl=${wsdlId}` : "/soap"} className="text-accent hover:underline">
          Abrir no Laboratório SOAP
        </Link>.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
      )}
      {response?.fault && (
        <div role="alert" className="space-y-1 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">SOAP Fault{response.fault.code ? `: ${response.fault.code}` : ""}</p>
          <p>{response.fault.message || "(sem mensagem)"}</p>
          {response.fault.detail && <p className="text-xs text-muted">{response.fault.detail}</p>}
        </div>
      )}
      {response && (
        <div className="space-y-2">
          {onDiagnose && isError && (
            <button
              type="button"
              onClick={diagnose}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Stethoscope className="size-4 text-accent" aria-hidden />
              Diagnosticar este erro
            </button>
          )}
          <ResponseView response={response} />
        </div>
      )}
    </section>
  );
}
