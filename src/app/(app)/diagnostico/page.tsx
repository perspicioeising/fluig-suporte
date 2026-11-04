import { Suspense } from "react";
import * as z from "zod";
import type { Metadata } from "next";
import { listEnvironments } from "@/modules/environments/queries";
import { getDiagnostic, listDiagnostics, listHistoryOptions } from "@/modules/diagnostics/queries";
import { DiagnosticWorkspace } from "@/modules/diagnostics/components/diagnostic-workspace";

export const metadata: Metadata = { title: "Diagnóstico" };

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function DiagnosticPage({ searchParams }: PageProps<"/diagnostico">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Diagnóstico de integrações</h1>
        <p className="text-sm text-muted">
          Cole um erro (HTTP 401/403, timeout, SOAP Fault, JSON/XML inválido, falha do SDK...) e receba descrição,
          causas prováveis, evidências, validações e próximos passos, com base na documentação oficial. Quando as
          evidências não bastarem, o diagnóstico diz isso.
        </p>
      </div>

      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando...
          </p>
        }
      >
        <DiagnosticContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function DiagnosticContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const diagnosticParam = first(raw.d);
  const historyParam = first(raw.history);
  const historyId = z.uuid().safeParse(historyParam).success ? (historyParam as string) : null;

  const [environments, diagnostics, historyOptions, saved] = await Promise.all([
    listEnvironments(),
    listDiagnostics(),
    listHistoryOptions(historyId),
    diagnosticParam ? getDiagnostic(diagnosticParam) : Promise.resolve(null),
  ]);

  // Vindo do API Tester / Laboratório SOAP: sugere um texto inicial com os fatos da requisição.
  const attachedHistory = historyId ? historyOptions.find((h) => h.id === historyId) : undefined;
  const initialText = attachedHistory
    ? `${attachedHistory.method} ${attachedHistory.url.split(" :: ")[0]} retornou ${attachedHistory.status_code ?? "sem resposta"}${attachedHistory.error ? `: ${attachedHistory.error}` : ""}`
    : "";

  return (
    <DiagnosticWorkspace
      key={saved?.id ?? `new-${historyId ?? ""}`}
      environments={environments.filter((e) => e.is_active).map((e) => ({ id: e.id, name: e.name }))}
      historyOptions={historyOptions}
      diagnostics={diagnostics}
      initialText={initialText}
      initialHistoryId={attachedHistory ? attachedHistory.id : null}
      saved={saved}
    />
  );
}
