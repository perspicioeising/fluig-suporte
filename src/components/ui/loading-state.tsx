import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado de carregamento padrão: texto anunciado a leitores de tela + esqueleto visual. */
export function LoadingState({ label = "Carregando...", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-4", className)}>
      <p className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
        {label}
      </p>
      <div aria-hidden className="space-y-3">
        <div className="h-10 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
        <div className="grid gap-3 @2xl/main:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="h-40 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
