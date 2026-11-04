/** Constantes da sidebar usadas no servidor (root layout) e no cliente (sidebar-store). */

export const SIDEBAR_STORAGE_KEY = "fis:sidebar";

/**
 * Script inline do <head>: marca <html data-sidebar="collapsed"> antes da primeira pintura,
 * para a sidebar já nascer recolhida sem "pulo" (ver
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="collapsed")document.documentElement.setAttribute("data-sidebar","collapsed")}catch(e){}})()`;
