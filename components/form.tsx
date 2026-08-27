import type { ReactNode } from "react";

const INPUT =
  "rounded-lg bg-surface-2 px-3 py-2 text-sm ring-1 ring-line/60 outline-none focus:ring-2 focus:ring-gold/70";

export function Field({
  label,
  name,
  required,
  placeholder,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  defaultValue?: string | number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        type={type}
        defaultValue={defaultValue}
        className={INPUT}
      />
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
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <select name={name} required={required} defaultValue={defaultValue} className={INPUT}>
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

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90"
    >
      {children}
    </button>
  );
}

export function FormCard({ action, children }: { action: (fd: FormData) => void; children: ReactNode }) {
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-4 rounded-2xl bg-surface p-6 ring-1 ring-line/60 shadow-[0_1px_2px_rgba(20,20,20,0.04)] sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </form>
  );
}
