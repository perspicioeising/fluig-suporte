"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu } from "lucide-react";
import { logout } from "@/modules/auth/actions";
import { NAV_ITEMS } from "../nav-items";
import { toggleMobileOpen, useSidebarState } from "../sidebar-store";
import { SIDEBAR_ID } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

/** Título da página atual, com "migalha" para subpáginas (ex.: APIs Fluig › Detalhe). */
function PageTitle() {
  const pathname = usePathname();
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (!item) return null;
  const Icon = item.icon;
  const isChild = pathname !== item.href;

  return (
    <nav aria-label="Você está em" className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-accent" aria-hidden />
      {isChild ? (
        <>
          <Link href={item.href} className="truncate text-muted hover:text-foreground">
            {item.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span aria-current="page" className="truncate font-medium">Detalhe</span>
        </>
      ) : (
        <span aria-current="page" className="truncate font-medium">{item.label}</span>
      )}
    </nav>
  );
}

export function AppHeader({ email }: { email: string }) {
  const { mobileOpen } = useSidebarState();
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <button
        type="button"
        onClick={toggleMobileOpen}
        aria-controls={SIDEBAR_ID}
        aria-expanded={mobileOpen}
        aria-label="Abrir menu"
        className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <PageTitle />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
        >
          {initial}
        </span>
        <span className="hidden max-w-56 truncate text-sm text-muted md:block" title={email}>
          {email}
        </span>
        <form action={logout}>
          <button
            type="submit"
            title="Sair"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </form>
      </div>
    </header>
  );
}
