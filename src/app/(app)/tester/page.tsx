import { Suspense } from "react";
import type { Metadata } from "next";
import { getTesterData } from "@/modules/tester/queries";
import { parseTesterPrefill } from "@/modules/builder/tester-link";
import { TesterWorkspace } from "@/modules/tester/components/tester-workspace";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "API Tester" };

type RawSearchParams = Record<string, string | string[] | undefined>;

export default function TesterPage({ searchParams }: PageProps<"/tester">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API Tester</h1>
        <p className="text-sm text-muted">
          Execute requisições contra seus ambientes Fluig. As credenciais do
          ambiente são aplicadas no servidor e as chamadas são somente leitura
          por padrão.
        </p>
      </div>

      <Suspense
        fallback={
          <LoadingState label="Carregando..." />
        }
      >
        <TesterContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function TesterContent({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [data, raw] = await Promise.all([getTesterData(), searchParams]);

  // Pré-preenchimento vindo do Construtor/Catálogo (validado: a URL é entrada não confiável).
  const prefill = parseTesterPrefill(raw);

  return (
    <TesterWorkspace
      // Novo pré-preenchimento = nova instância (estado inicial recalculado).
      key={prefill ? JSON.stringify(prefill) : "manual"}
      environments={data.environments}
      collections={data.collections}
      history={data.history}
      prefill={prefill}
    />
  );
}
