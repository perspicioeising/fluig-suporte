import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted";

export function Field({
  id,
  label,
  errors,
  hint,
  className,
  ...props
}: {
  id: string;
  label: string;
  errors?: string[];
  hint?: string;
} & Omit<ComponentProps<"input">, "id">) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={props.name ?? id}
        aria-invalid={errors ? true : undefined}
        aria-describedby={[errors ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={inputClass}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {errors && (
        <p id={errorId} className="text-xs text-danger">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & Omit<ComponentProps<"input">, "id" | "type">) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={props.name ?? id}
        type="checkbox"
        className="mt-1 size-4 accent-[var(--accent)]"
        {...props}
      />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  );
}

export function FormMessage({ ok, message }: { ok?: boolean; message?: string }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn("text-sm", ok ? "text-success" : "text-danger")}
    >
      {message}
    </p>
  );
}

export const primaryButton =
  "rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60";
export const secondaryButton =
  "rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-60";
