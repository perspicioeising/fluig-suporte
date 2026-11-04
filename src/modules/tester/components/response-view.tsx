"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExecuteResponse } from "../schemas";

function statusClass(status: number | null) {
  if (status === null) return "bg-danger/15 text-danger";
  if (status >= 200 && status < 300) return "bg-success/15 text-success";
  if (status >= 300 && status < 400) return "bg-accent/15 text-accent";
  return "bg-danger/15 text-danger";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function prettify(body: string, contentType: string | undefined) {
  const looksJson =
    /json/i.test(contentType ?? "") || /^\s*[{[]/.test(body);
  if (looksJson) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

export function ResponseView({ response }: { response: ExecuteResponse }) {
  const [tab, setTab] = useState<"body" | "headers">("body");
  const [raw, setRaw] = useState(false);

  const contentType = response.headers["content-type"];
  const pretty = useMemo(
    () => (raw ? response.body : prettify(response.body, contentType)),
    [raw, response.body, contentType],
  );

  return (
    <section aria-label="Resposta" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={cn(
            "rounded px-2 py-0.5 font-mono font-medium",
            statusClass(response.status),
          )}
        >
          {response.status === null ? "Sem resposta" : `${response.status} ${response.statusText}`}
        </span>
        <span className="text-muted">{response.durationMs} ms</span>
        <span className="text-muted">{formatBytes(response.sizeBytes)}</span>
        {contentType && <span className="truncate font-mono text-xs text-muted">{contentType}</span>}
      </div>

      {response.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {response.error}
        </p>
      )}

      <div role="tablist" aria-label="Partes da resposta" className="flex gap-1 border-b border-border">
        {(["body", "headers"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-sm text-muted hover:text-foreground",
              tab === t && "border-b-2 border-accent text-foreground",
            )}
          >
            {t === "body" ? "Corpo" : `Headers (${Object.keys(response.headers).length})`}
          </button>
        ))}
      </div>

      {tab === "body" ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} className="accent-[var(--accent)]" />
            Exibir sem formatar
          </label>
          {response.truncated && (
            <p className="text-xs text-accent">Resposta truncada pelo limite de tamanho.</p>
          )}
          <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap break-words">
            <code>{pretty || "(corpo vazio)"}</code>
          </pre>
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-border">
              {Object.entries(response.headers).map(([name, value]) => (
                <tr key={name}>
                  <th scope="row" className="py-1.5 pr-4 align-top font-mono font-medium">
                    {name}
                  </th>
                  <td className="py-1.5 font-mono break-all text-muted">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
