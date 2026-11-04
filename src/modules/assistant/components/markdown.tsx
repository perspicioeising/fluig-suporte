"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Source } from "../types";

/**
 * Transforma [n] em links para a fonte oficial. Não toca em blocos de código.
 * O react-markdown não renderiza HTML bruto e bloqueia URLs perigosas (javascript:).
 */
export function linkCitations(text: string, sources: Source[]): string {
  const byIndex = new Map(sources.map((s) => [s.index, s]));
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part; // trecho de código
      return part.replace(/\[(\d{1,2})\](?!\()/g, (match, n: string) => {
        const source = byIndex.get(Number(n));
        if (!source) return match;
        const url = source.url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
        return `[\\[${n}\\]](${url})`;
      });
    })
    .join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  async function copy(node: HTMLElement | null) {
    const text = node?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível: ignora
    }
  }

  return (
    <div className="group relative my-3">
      <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs">
        {children}
      </pre>
      <button
        type="button"
        onClick={(e) => void copy(e.currentTarget.parentElement?.querySelector("pre code") as HTMLElement | null)}
        aria-label="Copiar código"
        className="absolute top-2 right-2 rounded-md border border-border bg-surface p-1.5 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}

export function Markdown({ text, sources = [] }: { text: string; sources?: Source[] }) {
  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-relaxed break-words",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface-2 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const label = Array.isArray(children) ? children.join("") : String(children ?? "");
            const isCitation = /^\[\d+\]$/.test(label);
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("text-accent hover:underline", isCitation && "align-super text-[0.7em] font-medium")}
              >
                {children}
              </a>
            );
          },
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          h1: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="text-sm font-semibold">{children}</h4>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border bg-surface-2 px-2 py-1 font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-3 text-muted">{children}</blockquote>
          ),
        }}
      >
        {linkCitations(text, sources)}
      </ReactMarkdown>
    </div>
  );
}
