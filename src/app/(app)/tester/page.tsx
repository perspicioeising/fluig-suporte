import { Suspense } from "react";
import type { Metadata } from "next";
import { getTesterData } from "@/modules/tester/queries";
import { HTTP_METHODS, type HttpMethod } from "@/modules/tester/schemas";
import { TesterWorkspace } from "@/modules/tester/components/tester-workspace";

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
          <p role="status" className="text-sm text-muted">
            Carregando...
          </p>
        }
      >
        <TesterContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function TesterContent({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [data, raw] = await Promise.all([getTesterData(), searchParams]);

  // Pré-preenchimento vindo do catálogo (?method=GET&path=/...)
  const rawMethod = first(raw.method)?.toUpperCase();
  const initialMethod = (HTTP_METHODS as readonly string[]).includes(rawMethod ?? "")
    ? (rawMethod as HttpMethod)
    : undefined;
  const rawPath = first(raw.path);
  const initialPath = rawPath && /^\/(?!\/)[^\\\u0000-\u001f]{0,1999}$/.test(rawPath) ? rawPath : undefined;

  return (
    <TesterWorkspace
      key={`${initialMethod ?? ""}|${initialPath ?? ""}`}
      environments={data.environments}
      collections={data.collections}
      history={data.history}
      initialMethod={initialMethod}
      initialPath={initialPath}
    />
  );
}
