import type { ChangeEvent, ReactNode } from "react";

const INPUT =
  "rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/20";

export function Field({
  label,
  name,
  required,
  placeholder,
  type = "text",
  defaultValue,
  hint,
  minLength,
  autoComplete,
  step,
  min,
  value,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  defaultValue?: string | number;
  hint?: string;
  minLength?: number;
  autoComplete?: string;
  step?: string | number;
  min?: string | number;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        type={type}
        {...(value !== undefined ? { value, onChange } : { defaultValue })}
        minLength={minLength}
        autoComplete={autoComplete}
        step={step}
        min={min}
        className={INPUT}
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  required,
  placeholder,
  options,
  defaultValue = "",
  value,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      <select
        name={name}
        required={required}
        {...(value !== undefined ? { value, onChange } : { defaultValue })}
        className={INPUT}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  name,
  required,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        rows={rows}
        className={`${INPUT} resize-y`}
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-surface transition hover:bg-black"
    >
      {children}
    </button>
  );
}

export function FormCard({ action, children }: { action: (fd: FormData) => void; children: ReactNode }) {
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-6 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </form>
  );
}
