import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NAV_ITEMS } from "@/modules/navigation/nav-items";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  const modules = NAV_ITEMS.filter((item) => item.href !== "/dashboard");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">Visão geral das suas integrações com TOTVS Fluig.</p>
      </div>

      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando resumo...
          </p>
        }
      >
        <Summary />
      </Suspense>

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

function statusClass(status: number | null) {
  if (status === null) return "text-danger";
  return status >= 200 && status < 300 ? "text-success" : "text-danger";
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function Summary() {
  const supabase = await createClient();

  const [environments, savedRequests, collections, wsdls, history, diagnostics] = await Promise.all([
    // Colunas explícitas: o navegador não pode ler encrypted_credentials, então select("*") falharia.
    supabase.from("fluig_environments").select("id", { count: "exact", head: true }),
    supabase.from("saved_requests").select("*", { count: "exact", head: true }),
    supabase.from("collections").select("*", { count: "exact", head: true }),
    supabase.from("soap_wsdls").select("*", { count: "exact", head: true }),
    supabase
      .from("request_history")
      .select("id, kind, method, url, status_code, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("diagnostics")
      .select("id, created_at, input_text")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { label: "Ambientes", value: environments.count ?? 0, href: "/configuracoes" },
    { label: "Requisições salvas", value: savedRequests.count ?? 0, href: "/tester", hint: `${collections.count ?? 0} coleções` },
    { label: "WSDLs importados", value: wsdls.count ?? 0, href: "/soap" },
  ];

  return (
    <section aria-labelledby="resumo" className="space-y-4">
      <h2 id="resumo" className="text-sm font-medium text-muted">
        Resumo
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-border bg-surface p-4 hover:border-accent">
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">Últimas requisições</h3>
          {(history.data?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma requisição executada ainda.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {history.data!.map((h) => (
                <li key={h.id as string} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-accent">{h.method as string}</span>
                  <span className={cn("w-9 shrink-0 font-mono text-xs", statusClass(h.status_code as number | null))}>
                    {(h.status_code as number | null) ?? "ERR"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                    {(() => {
                      try {
                        return new URL(String(h.url).split(" :: ")[0]).pathname;
                      } catch {
                        return String(h.url);
                      }
                    })()}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{when(h.created_at as string)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">Últimos diagnósticos</h3>
          {(diagnostics.data?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum diagnóstico realizado.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {diagnostics.data!.map((d) => (
                <li key={d.id as string} className="py-1.5">
                  <Link href={`/diagnostico?d=${d.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
                    <span className="min-w-0 flex-1 truncate">
                      {String(d.input_text).replace(/\s+/g, " ").slice(0, 80)}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{when(d.created_at as string)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
