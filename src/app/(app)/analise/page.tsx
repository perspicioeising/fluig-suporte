import type { Metadata } from "next";
import { LogAnalyzer } from "@/modules/support/components/log-analyzer";

export const metadata: Metadata = { title: "Análise de Logs" };

export default function AnalysisPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Análise de Logs</h1>
        <p className="text-sm text-muted">
          Envie o <code className="font-mono">server.log</code> do Fluig para identificar erros, exceções e padrões
          conhecidos, ver a linha do tempo e o ambiente do servidor. O arquivo é processado no seu navegador e não é
          enviado a nenhum servidor.
        </p>
      </div>
      <LogAnalyzer />
    </section>
  );
}
