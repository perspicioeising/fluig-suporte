import type { Metadata } from "next";
import Link from "next/link";
import { NAV_ITEMS } from "@/modules/navigation/nav-items";

export const metadata: Metadata = { title: "Dashboard" };

// Os dados reais (histórico, integrações salvas, diagnósticos) chegam
// com o banco de dados na fase 3 e o API Tester na fase 5.
const SUMMARY = [
  { title: "Integrações salvas", empty: "Nenhuma integração salva ainda." },
  { title: "Histórico de requisições", empty: "Nenhuma requisição executada." },
  { title: "Últimos diagnósticos", empty: "Nenhum diagnóstico realizado." },
];

export default function DashboardPage() {
  const modules = NAV_ITEMS.filter((item) => item.href !== "/dashboard");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          Visão geral das suas integrações com TOTVS Fluig.
        </p>
      </div>

      <section aria-labelledby="resumo" className="space-y-3">
        <h2 id="resumo" className="text-sm font-medium text-muted">
          Resumo
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {SUMMARY.map(({ title, empty }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-2 text-sm text-muted">{empty}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="modulos" className="space-y-3">
        <h2 id="modulos" className="text-sm font-medium text-muted">
          Módulos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border bg-surface p-4 hover:border-accent"
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-accent" aria-hidden />
                <h3 className="text-sm font-medium">{label}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
