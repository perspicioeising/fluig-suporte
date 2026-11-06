"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { applyThemeAttribute, toggleTheme, useTheme } from "../theme-store";

/** Botão de alternância claro/escuro no cabeçalho. O tema persiste em localStorage. */
export function ThemeToggle() {
  const theme = useTheme();

  // Em dev, o Strict Mode remonta os componentes; reaplica o atributo no <html> para o
  // estado do store e o DOM não divergirem (mesmo padrão da sidebar).
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
    >
      {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
