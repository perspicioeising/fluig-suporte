import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoadingState } from "@/components/ui/loading-state";
import { AppHeader } from "@/modules/navigation/components/app-header";
import { Sidebar } from "@/modules/navigation/components/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      {/* usePathname() em rotas dinâmicas exige Suspense (Cache Components).
          O fallback ocupa a mesma largura da sidebar para o conteúdo não "pular". */}
      <Suspense
        fallback={
          <div
            aria-hidden
            className="hidden h-dvh shrink-0 border-r border-border bg-surface lg:sticky lg:top-0 lg:block lg:w-60 lg:sidebar-collapsed:w-16"
          />
        }
      >
        <Sidebar />
      </Suspense>

      {/* O conteúdo ocupa o espaço que sobra e acompanha a largura da sidebar. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* A leitura da sessão usa cookies(): fica atrás de Suspense (Cache Components). */}
        <Suspense
          fallback={
            <>
              <div aria-hidden className="h-14 shrink-0 border-b border-border" />
              <div className="@container/main flex-1 px-4 py-5 md:px-6 md:py-6">
                <LoadingState />
              </div>
            </>
          }
        >
          <AuthenticatedContent>{children}</AuthenticatedContent>
        </Suspense>
      </div>
    </div>
  );
}

async function AuthenticatedContent({ children }: { children: React.ReactNode }) {
  // Verificação real de sessão no servidor (o proxy faz apenas checagem otimista).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <>
      <AppHeader email={user.email ?? ""} />
      {/* @container/main: as páginas usam container queries (@2xl/main:, @5xl/main: ...), então o layout
          responde à largura real disponível — que muda ao recolher/expandir a sidebar — e não à da tela. */}
      <main id="conteudo" tabIndex={-1} className="@container/main flex-1 px-4 py-5 outline-none md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </>
  );
}
