"use client";

import { useActionState, useId, useState } from "react";
import type { FormState } from "@/features/auth/schemas";

export type FormField = { name: string; label: string; type?: string; autoComplete?: string; required?: boolean; hint?: string; value?: string; maxLength?: number };

function InputField({ field, errors, prefix }: { field: FormField; errors?: string[]; prefix: string }) {
  const [visible, setVisible] = useState(false);
  const password = field.type === "password";
  const inputId = `${prefix}-${field.name}`;
  const hintId = `${inputId}-hint`;
  return <div className="space-y-2">
    <label className="block text-sm font-medium text-ink" htmlFor={inputId}>{field.label}</label>
    <div className="relative">
      <input id={inputId} name={field.name} type={password && visible ? "text" : field.type ?? "text"}
        autoComplete={field.autoComplete} required={field.required ?? true} defaultValue={field.value}
        maxLength={field.maxLength} aria-invalid={!!errors?.length} aria-describedby={field.hint || errors?.length ? hintId : undefined}
        className={`field-control text-base ${password ? "pr-20" : ""}`} />
      {password && <button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
        className="absolute inset-y-0 right-3 text-sm font-medium text-accent-dark" onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button>}
    </div>
    {(field.hint || errors?.length) && <p id={hintId} className={`text-sm ${errors?.length ? "text-danger" : "text-muted"}`}>{errors?.join(" ") ?? field.hint}</p>}
  </div>;
}

export function AuthForm({ action, fields, submitLabel, hidden = {} }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  fields: FormField[]; submitLabel: string; hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = useId();
  return <form action={formAction} className="space-y-5" aria-busy={pending}>
    {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {fields.map(field => <InputField key={field.name} prefix={prefix} field={field} errors={state.fieldErrors?.[field.name]} />)}
    {state.error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg border border-warning/30 bg-accent-soft p-3 text-sm text-accent-dark">{state.success}</p>}
    <button type="submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">
      {pending ? "Please wait…" : submitLabel}
    </button>
  </form>;
}
