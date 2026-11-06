"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "./theme-constants";

/**
 * Tema da interface (claro/escuro). Fica em <html data-theme="dark|light"> e no localStorage.
 * As cores vêm de variáveis CSS trocadas por esse atributo; um script inline no <head> o
 * aplica antes da primeira pintura, então não há "flash" ao carregar.
 */

const SERVER_THEME: Theme = "dark";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    if (t === "light" || t === "dark") return t;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let theme: Theme = typeof window === "undefined" ? SERVER_THEME : readTheme();
const listeners = new Set<() => void>();

/** Aplica a marca no <html> (também para reaplicar após o remount do Strict Mode em dev). */
export function applyThemeAttribute(next: Theme = theme) {
  document.documentElement.setAttribute("data-theme", next);
}

export function setTheme(next: Theme) {
  theme = next;
  applyThemeAttribute(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* navegação privada sem storage: vale só para esta aba */
  }
  listeners.forEach((l) => l());
}

export const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => theme,
    () => SERVER_THEME,
  );
}
