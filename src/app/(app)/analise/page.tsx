import type { Metadata } from "next";
import { SupportTabs } from "@/modules/support/components/support-tabs";

export const metadata: Metadata = { title: "Análise de Logs e Configurações" };

export default function AnalysisPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Análise de Logs e Configurações</h1>
        <p className="text-sm text-muted">
          Analise o <code className="font-mono">server.log</code> e os arquivos de configuração do Fluig
          (<code className="font-mono">standalone.xml</code>, <code className="font-mono">domain.xml</code>,{" "}
          <code className="font-mono">host.xml</code>, <code className="font-mono">standalone.conf</code>) para
          investigar problemas. Tudo é processado no seu navegador e não é enviado a nenhum servidor.
        </p>
      </div>
      <SupportTabs />
    </section>
  );
}
