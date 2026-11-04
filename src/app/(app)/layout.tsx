import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/modules/auth/actions";
import { Sidebar } from "@/modules/navigation/components/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* usePathname() em rotas dinâmicas exige Suspense (Cache Components). */}
      <Suspense
        fallback={
          <aside className="border-b border-border bg-surface md:w-60 md:shrink-0 md:border-r md:border-b-0" />
        }
      >
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* A leitura da sessão usa cookies(): fica atrás de Suspense (Cache Components). */}
        <Suspense
          fallback={
            <p role="status" className="p-6 text-sm text-muted">
              Carregando...
            </p>
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
      <header className="flex items-center justify-end gap-3 border-b border-border px-4 py-2 text-sm">
        <span className="truncate text-muted">{user.email}</span>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </button>
        </form>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </>
  );
}
