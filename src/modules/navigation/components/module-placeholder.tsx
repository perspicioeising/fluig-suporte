import { Construction } from "lucide-react";
import { getNavItem } from "../nav-items";

/** Página provisória dos módulos que serão implementados nas próximas fases. */
export function ModulePlaceholder({
  href,
  phase,
}: {
  href: string;
  phase: string;
}) {
  const item = getNavItem(href);
  if (!item) return null;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{item.label}</h1>
        <p className="text-sm text-muted">{item.description}</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
        <Construction className="size-5 text-accent" aria-hidden />
        Módulo planejado para a {phase}.
      </div>
    </section>
  );
}
