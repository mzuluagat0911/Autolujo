import type { ReactNode } from "react";

const INPUT =
  "rounded-md bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-gold";

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
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
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
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
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
      className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-surface transition hover:bg-black"
    >
      {children}
    </button>
  );
}

export function FormCard({ action, children }: { action: (fd: FormData) => void; children: ReactNode }) {
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-4 rounded-lg bg-surface p-6 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </form>
  );
}
