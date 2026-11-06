/** Constantes do tema usadas no servidor (root layout) e no cliente (theme-store). */

export const THEME_STORAGE_KEY = "fis:theme";

export type Theme = "dark" | "light";

/**
 * Script inline do <head>: marca <html data-theme="dark|light"> antes da primeira pintura,
 * usando o tema salvo ou, na ausência dele, a preferência do sistema. Evita o "flash" de
 * tema errado (ver node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;
