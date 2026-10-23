import type { RegistroCarro } from "@/lib/seguros/datos";

const CAMPOS: { k: keyof RegistroCarro; label: string }[] = [
  { k: "placa", label: "Placa" },
  { k: "marca", label: "Marca" },
  { k: "modelo", label: "Modelo" },
  { k: "anio", label: "Año" },
  { k: "color", label: "Color" },
  { k: "tipo", label: "Tipo" },
  { k: "chasis", label: "Chasis" },
  { k: "motor", label: "Motor" },
];

export function BloqueRegistro({ registro }: { registro: RegistroCarro }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {CAMPOS.map((c) => (
        <div key={c.k}>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{c.label}</dt>
          <dd className="mt-0.5">{registro[c.k].trim() || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
