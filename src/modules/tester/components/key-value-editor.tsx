"use client";

import { Plus, Trash2 } from "lucide-react";
import type { KeyValue } from "../schemas";

const inputClass =
  "min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs placeholder:text-muted";

export function KeyValueEditor({
  label,
  rows,
  onChange,
  keyPlaceholder = "chave",
  valuePlaceholder = "valor",
}: {
  label: string;
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {rows.length === 0 && (
        <p className="text-xs text-muted">Nenhum item. Use o botão abaixo para adicionar.</p>
      )}
      {rows.some((r) => r.required || r.hint) && (
        <p className="text-xs text-muted">
          Itens com <span className="font-semibold text-danger">*</span> são obrigatórios na documentação.
          Os desmarcados são opcionais: marque para enviar.
        </p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(index, { enabled: e.target.checked })}
            aria-label={`Ativar ${label.toLowerCase()} ${index + 1}`}
            className="size-4 accent-[var(--accent)]"
          />
          {row.required ? (
            <span
              className="w-3 shrink-0 text-center font-semibold text-danger"
              title="Obrigatório segundo a documentação"
              aria-label="obrigatório"
            >
              *
            </span>
          ) : (
            <span className="w-3 shrink-0" aria-hidden />
          )}
          <input
            value={row.key}
            onChange={(e) => update(index, { key: e.target.value })}
            placeholder={keyPlaceholder}
            aria-label={`${label}: nome ${index + 1}${row.required ? " (obrigatório)" : ""}`}
            title={row.hint}
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            value={row.value}
            onChange={(e) => update(index, { value: e.target.value })}
            placeholder={row.hint ?? valuePlaceholder}
            aria-label={`${label}: valor ${index + 1}`}
            title={row.hint}
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remover ${label.toLowerCase()} ${index + 1}`}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { key: "", value: "", enabled: true }])}
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        <Plus className="size-3" aria-hidden />
        Adicionar
      </button>
    </div>
  );
}
