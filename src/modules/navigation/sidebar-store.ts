"use client";

import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-constants";

/**
 * Estado da navegação lateral, compartilhado entre a sidebar e o botão de menu do cabeçalho.
 *
 * - `collapsed` (desktop): fica em <html data-sidebar="collapsed|expanded"> e no localStorage.
 *   A largura é aplicada só por CSS (variante `sidebar-collapsed`), e um script inline no
 *   <head> marca o <html> antes da primeira pintura, então não há "pulo" ao carregar.
 * - `mobileOpen` (celular/tablet): gaveta aberta ou fechada; não é persistida.
 */

type SidebarState = { collapsed: boolean; mobileOpen: boolean };

const SERVER_STATE: SidebarState = { collapsed: false, mobileOpen: false };

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

let state: SidebarState = typeof window === "undefined" ? SERVER_STATE : { collapsed: readCollapsed(), mobileOpen: false };
const listeners = new Set<() => void>();

function update(next: Partial<SidebarState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Aplica a marca no <html> (também usado para reaplicar após o remount do Strict Mode em dev). */
export function applyCollapsedAttribute(collapsed = state.collapsed) {
  document.documentElement.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
}

export function setCollapsed(collapsed: boolean) {
  applyCollapsedAttribute(collapsed);
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* navegação privada sem storage: vale só para esta aba */
  }
  update({ collapsed });
}

export const toggleCollapsed = () => setCollapsed(!state.collapsed);
export const setMobileOpen = (mobileOpen: boolean) => update({ mobileOpen });
export const toggleMobileOpen = () => update({ mobileOpen: !state.mobileOpen });

export function useSidebarState(): SidebarState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}

/** Mesmo breakpoint do Tailwind `lg` (64rem): a partir dele a sidebar fica fixa ao lado do conteúdo. */
export const DESKTOP_QUERY = "(min-width: 64rem)";
