import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Source } from "../types";

const KIND_LABEL: Record<string, string> = {
  rest_new: "REST novo",
  rest_old: "REST antigo",
  soap: "SOAP",
  sdk: "SDK",
  docs: "Documentação",
};

export function SourcesList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  const cited = sources.filter((s) => s.cited);

  return (
    <details className="rounded-md border border-border bg-surface-2 text-xs">
      <summary className="cursor-pointer px-3 py-2 text-muted hover:text-foreground">
        Fontes consultadas ({sources.length}
        {cited.length > 0 ? `, ${cited.length} citada${cited.length > 1 ? "s" : ""}` : ""})
      </summary>
      <ol className="space-y-2 border-t border-border p-3">
        {sources.map((source) => (
          <li key={source.index} className={cn("space-y-0.5", source.cited === false && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-accent">[{source.index}]</span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
                {KIND_LABEL[source.kind] ?? source.kind}
              </span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 font-medium hover:text-accent hover:underline"
              >
                <span className="truncate">{source.title}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
              {source.entryId && (
                <Link href={`/catalogo/${source.entryId}`} className="text-accent hover:underline">
                  ver no catálogo
                </Link>
              )}
            </div>
            <p className="line-clamp-2 text-muted">{source.snippet}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
