import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renderiza o Markdown da ajuda (server component). O react-markdown não interpreta HTML
 * bruto e bloqueia URLs perigosas, então o conteúdo é seguro por construção.
 */
export function HelpMarkdown({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "space-y-4 text-sm leading-relaxed",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface-2 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const external = /^https?:\/\//.test(href ?? "");
            return (
              <a
                href={href}
                className="text-accent hover:underline"
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
          h3: ({ children }) => <h3 className="pt-2 text-base font-semibold">{children}</h3>,
          h4: ({ children }) => <h4 className="pt-1 text-sm font-semibold">{children}</h4>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>,
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="space-y-2 rounded-r-md border-l-2 border-accent bg-surface-2 px-4 py-3 text-muted">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
