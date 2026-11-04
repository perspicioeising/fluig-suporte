import { KIND_LABELS, type EntryKind } from "../types";

export function KindBadge({ kind }: { kind: EntryKind }) {
  return (
    <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
      {KIND_LABELS[kind]}
    </span>
  );
}

export function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  return (
    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-xs font-medium text-accent">
      {method}
    </span>
  );
}
