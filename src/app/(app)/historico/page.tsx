import { Suspense } from "react";
import type { Metadata } from "next";
import { HistoryView } from "@/modules/history/components/history-view";

export const metadata: Metadata = { title: "Histórico" };

export default function HistoryPage({ searchParams }: PageProps<"/historico">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico de requisições</h1>
        <p className="text-sm text-muted">
          Chamadas feitas no API Tester e no Laboratório SOAP neste workspace, com credenciais mascaradas. Você pode
          filtrar, abrir o detalhe, reabrir no Tester, diagnosticar e excluir os registros que fez.
        </p>
      </div>

      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando histórico...
          </p>
        }
      >
        <HistoryView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
