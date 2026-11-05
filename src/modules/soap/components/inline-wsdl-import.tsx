"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/modules/environments/constants";
import { importWsdlFile, importWsdlFromEnvironment } from "../actions";
import type { SoapImportState } from "../schemas";

const fieldClass = "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted";

function Warnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">Avisos ({warnings.length})</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.slice(0, 20).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Importa o WSDL de UM serviço sem sair do detalhe da API. O nome do serviço vem da
 * entrada aberta (ex.: ECMBusinessPeriodService), então a importação pelo ambiente é 1 clique.
 * Ao concluir, revalida a página para a aba Testar passar a encontrar o WSDL.
 */
export function InlineWsdlImport({
  serviceName,
  environments,
}: {
  serviceName: string;
  environments: EnvironmentSummary[];
}) {
  const router = useRouter();
  const activeEnvs = environments.filter((e) => e.is_active);
  const [mode, setMode] = useState<"env" | "file">(activeEnvs.length > 0 ? "env" : "file");

  return (
    <section aria-label="Importar WSDL" className="space-y-3 rounded-lg border border-dashed border-border bg-surface p-4">
      <div>
        <p className="text-sm">
          Para testar <span className="font-mono">{serviceName}</span> aqui, importe o WSDL do serviço. O endpoint, a
          SOAPAction e o namespace exatos vêm do WSDL do seu ambiente.
        </p>
      </div>

      <div role="tablist" aria-label="Origem do WSDL" className="flex gap-1 border-b border-border">
        {([["env", "Do ambiente"], ["file", "Arquivo"]] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "px-3 py-1.5 text-sm text-muted hover:text-foreground",
              mode === id && "border-b-2 border-accent text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "env" ? (
        <EnvImport serviceName={serviceName} environments={activeEnvs} onDone={() => router.refresh()} />
      ) : (
        <FileImport serviceName={serviceName} onDone={() => router.refresh()} />
      )}
    </section>
  );
}

function EnvImport({
  serviceName,
  environments,
  onDone,
}: {
  serviceName: string;
  environments: EnvironmentSummary[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: SoapImportState, formData: FormData) => {
      const result = await importWsdlFromEnvironment(prev, formData);
      if (result?.ok) onDone();
      return result;
    },
    undefined,
  );

  if (environments.length === 0) {
    return (
      <p className="text-xs text-muted">
        Nenhum ambiente ativo. Cadastre um em Configurações, ou importe o WSDL por arquivo.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {/* O caminho padrão documentado do WSDL de um serviço: /webdesk/<Serviço>?wsdl */}
      <input type="hidden" name="customPath" value={`/webdesk/${serviceName}?wsdl`} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="inline-imp-env" className="text-xs font-medium">Ambiente</label>
          <select id="inline-imp-env" name="environmentId" defaultValue={environments[0]?.id} className={cn(fieldClass, "w-full @xl/main:w-56")}>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Server className="size-4" aria-hidden />}
          Importar o WSDL de {serviceName}
        </button>
      </div>
      <p className="text-xs text-muted">
        Baixa <span className="font-mono">/webdesk/{serviceName}?wsdl</span> do ambiente escolhido (feito no servidor).
      </p>
      {state?.message && (
        <p role="status" className={cn("text-xs", state.ok ? "text-success" : "text-danger")}>{state.message}</p>
      )}
      <Warnings warnings={state?.warnings} />
    </form>
  );
}

function FileImport({ serviceName, onDone }: { serviceName: string; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    async (prev: SoapImportState, formData: FormData) => {
      const result = await importWsdlFile(prev, formData);
      if (result?.ok) onDone();
      return result;
    },
    undefined,
  );
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(fd) => startTransition(() => action(fd))}
      className="space-y-3"
    >
      {/* Nome = serviço, para o WSDL casar com a operação aberta. */}
      <input type="hidden" name="name" value={serviceName} />
      <div className="space-y-1">
        <label htmlFor="inline-wsdl-file" className="text-xs font-medium">Arquivo WSDL de {serviceName}</label>
        <input
          id="inline-wsdl-file"
          name="file"
          type="file"
          accept=".wsdl,.xml,text/xml,application/xml"
          required
          className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
        Importar arquivo
      </button>
      <p className="text-xs text-muted">O nome do serviço precisa bater com a operação (o arquivo é salvo como {serviceName}).</p>
      {state?.message && (
        <p role="status" className={cn("text-xs", state.ok ? "text-success" : "text-danger")}>{state.message}</p>
      )}
      <Warnings warnings={state?.warnings} />
    </form>
  );
}
