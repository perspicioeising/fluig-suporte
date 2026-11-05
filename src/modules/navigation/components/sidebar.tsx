"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Plug, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADVANCED_NAV_ITEMS, PRIMARY_NAV_ITEMS, type NavItem } from "../nav-items";
import {
  DESKTOP_QUERY,
  applyCollapsedAttribute,
  setMobileOpen,
  toggleCollapsed,
  toggleMobileOpen,
  useSidebarState,
} from "../sidebar-store";

export const SIDEBAR_ID = "app-sidebar";

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Item de navegação (link + indicador de ativo + dica quando a sidebar está recolhida). */
function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <li className="relative">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors",
          "hover:bg-surface-2 hover:text-foreground",
          "lg:sidebar-collapsed:justify-center lg:sidebar-collapsed:px-0",
          active && "bg-surface-2 font-medium text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon className={cn("size-4.5 shrink-0", active && "text-accent")} aria-hidden />
        <span className="truncate lg:sidebar-collapsed:sr-only">{item.label}</span>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 rounded-md border border-border",
            "bg-surface-2 px-2.5 py-1 text-xs whitespace-nowrap text-foreground shadow-lg",
            "lg:sidebar-collapsed:group-hover:block lg:sidebar-collapsed:group-focus-visible:block",
          )}
        >
          {item.label}
        </span>
      </Link>
    </li>
  );
}

/**
 * Navegação principal.
 * - Desktop (lg+): fixa ao lado do conteúdo; expandida (15rem) ou recolhida (4rem, só ícones com dica).
 * - Celular/tablet: gaveta sobreposta, com fundo escurecido.
 * Atalho: Ctrl/⌘ + B alterna (recolhe no desktop, abre/fecha a gaveta no celular). Esc fecha a gaveta.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen } = useSidebarState();
  // Accordion já abre se a rota atual for uma ferramenta avançada.
  const advancedActive = ADVANCED_NAV_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Strict Mode (dev) remonta e limpa atributos do <html>: reaplica antes da pintura. Sem efeito em produção.
  useLayoutEffect(() => {
    applyCollapsedAttribute();
  }, []);

  // Atalhos de teclado.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b" && !isEditable(e.target)) {
        e.preventDefault();
        if (window.matchMedia(DESKTOP_QUERY).matches) toggleCollapsed();
        else toggleMobileOpen();
      } else if (e.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Ao passar para desktop, a gaveta deixa de existir: garante que não fique "aberta" escondida.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => mq.matches && setMobileOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Gaveta: trava a rolagem da página, leva o foco para dentro e devolve ao fechar.
  useEffect(() => {
    if (!mobileOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    // A gaveta sai de visibility:hidden no primeiro quadro da transição; elementos invisíveis
    // não recebem foco, então o foco vai para dentro só no quadro seguinte.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => closeRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = previous;
      returnFocusRef.current?.focus?.();
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Fundo da gaveta (só celular/tablet) */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id={SIDEBAR_ID}
        aria-label="Navegação principal"
        className={cn(
          // celular/tablet: gaveta
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl",
          "transition-[translate,width,visibility] duration-200 ease-out motion-reduce:transition-none",
          mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full",
          // desktop: coluna fixa ao lado do conteúdo, que acompanha a largura
          "lg:visible lg:sticky lg:top-0 lg:z-30 lg:h-dvh lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none",
          "lg:sidebar-collapsed:w-16",
        )}
      >
        {/* Marca */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4 lg:sidebar-collapsed:justify-center lg:sidebar-collapsed:px-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <Plug className="size-4.5" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight lg:sidebar-collapsed:sr-only">
            <span className="block truncate text-sm font-semibold">Fluig Integration</span>
            <span className="block text-[11px] tracking-wide text-muted uppercase">Studio</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Itens primários */}
        <nav
          aria-label="Principal"
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 lg:sidebar-collapsed:overflow-visible lg:sidebar-collapsed:px-2"
        >
          <ul className="space-y-0.5">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </ul>
        </nav>

        {/* Ferramentas avançadas: também acessíveis dentro do catálogo. Seção recolhível no rodapé. */}
        <div className="shrink-0 border-t border-border px-3 py-2 lg:sidebar-collapsed:px-2">
          {/* Recolhida (só ícones): mostra um traço e os ícones direto, sem accordion. */}
          <div aria-hidden className="mx-auto mb-1 hidden h-px w-8 bg-border lg:sidebar-collapsed:block" />
          <ul className="hidden space-y-0.5 lg:sidebar-collapsed:block">
            {ADVANCED_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </ul>

          {/* Expandida/gaveta: accordion "Ferramentas avançadas" (aberto se a rota ativa é uma delas). */}
          <details className="group/adv lg:sidebar-collapsed:hidden" open={advancedActive}>
            <summary
              className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
              title="Ferramentas avançadas"
            >
              <Wrench className="size-4.5 shrink-0" aria-hidden />
              <span className="truncate">Ferramentas avançadas</span>
              <ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-open/adv:rotate-180" aria-hidden />
            </summary>
            <ul className="mt-0.5 space-y-0.5">
              {ADVANCED_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </ul>
          </details>
        </div>

        {/* Recolher / expandir (desktop) */}
        <div className="hidden shrink-0 border-t border-border p-2 lg:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-controls={SIDEBAR_ID}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir menu (Ctrl+B)" : "Recolher menu (Ctrl+B)"}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground lg:sidebar-collapsed:justify-center lg:sidebar-collapsed:px-0"
          >
            {/* Ícone por CSS (sem depender da hidratação) */}
            <PanelLeftClose className="size-4.5 shrink-0 lg:sidebar-collapsed:hidden" aria-hidden />
            <PanelLeftOpen className="hidden size-4.5 shrink-0 lg:sidebar-collapsed:block" aria-hidden />
            <span className="lg:sidebar-collapsed:sr-only">{collapsed ? "Expandir menu" : "Recolher menu"}</span>
            <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[10px] text-muted lg:sidebar-collapsed:hidden">
              Ctrl B
            </kbd>
          </button>
        </div>
      </aside>
    </>
  );
}
