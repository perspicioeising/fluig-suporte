import { Suspense } from "react";
import type { Metadata } from "next";
import { listEnvironments } from "@/modules/environments/queries";
import { getOperations, listWsdls } from "@/modules/soap/queries";
import { SoapLab } from "@/modules/soap/components/soap-lab";

export const metadata: Metadata = { title: "Webservices SOAP" };

type RawSearchParams = Record<string, string | string[] | undefined>;

export default function SoapPage({ searchParams }: PageProps<"/soap">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Webservices SOAP</h1>
        <p className="text-sm text-muted">
          Importe WSDLs, explore operações e parâmetros, gere envelopes e teste
          chamadas. Operações que não são consultas só rodam em ambientes com
          escrita liberada.
        </p>
      </div>

      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando...
          </p>
        }
      >
        <SoapContent searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function SoapContent({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const wsdlParam = Array.isArray(raw.wsdl) ? raw.wsdl[0] : raw.wsdl;

  const [environments, wsdls] = await Promise.all([listEnvironments(), listWsdls()]);
  const selectedId = wsdls.find((w) => w.id === wsdlParam)?.id ?? null;
  const operations = selectedId ? await getOperations(selectedId) : [];

  return (
    <SoapLab
      key={selectedId ?? "none"}
      environments={environments}
      wsdls={wsdls}
      selectedId={selectedId}
      operations={operations}
    />
  );
}
