import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, StatusChip } from "@/components/kit";
import { Field, Select, SubmitButton, FormCard } from "@/components/form";
import { createVehiculo } from "./actions";

export const dynamic = "force-dynamic";

type Empresa = { id: string; codigo: string; nombre: string };
type Vehiculo = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  km_actual: number | null;
  estado: string;
  empresa: { codigo: string } | null;
};

const ESTADOS = [
  { value: "activo", label: "Activo" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "chapisteria", label: "Chapistería" },
  { value: "por_entregar", label: "Por entregar" },
  { value: "improductivo", label: "Improductivo" },
  { value: "entregado", label: "Entregado" },
];

function estadoTone(e: string): "good" | "warn" | "crit" | "neutral" {
  if (e === "activo") return "good";
  if (e === "mantenimiento" || e === "chapisteria") return "warn";
  if (e === "improductivo") return "crit";
  return "neutral";
}
function estadoLabel(e: string): string {
  return ESTADOS.find((x) => x.value === e)?.label ?? e;
}

async function getData() {
  try {
    const sb = createServerSupabase();
    const [emp, veh] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("vehiculos")
        .select("id, numero, placa, marca, modelo, anio, km_actual, estado, empresa:empresas(codigo)")
        .order("numero"),
    ]);
    if (emp.error) throw emp.error;
    if (veh.error) throw veh.error;
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      vehiculos: (veh.data as unknown as Vehiculo[]) ?? [],
      error: null as string | null,
    };
  } catch (e) {
    return { empresas: [], vehiculos: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function VehiculosPage() {
  const { empresas, vehiculos, error } = await getData();
  const empOptions = empresas.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <PageHeader
        eyebrow="Cartera"
        title="Vehículos"
        subtitle="Flota por empresa. La numeración no se repite entre Autolujo, Kowua y Gold."
      />

      <div className="mt-8">
        <FormCard action={createVehiculo}>
          <Select label="Empresa *" name="empresa_id" required placeholder="Selecciona…" options={empOptions} />
          <Field label="Número de carro *" name="numero" required placeholder="210" />
          <Field label="Placa" name="placa" placeholder="AB1234" />
          <Field label="Marca" name="marca" placeholder="Hyundai" />
          <Field label="Modelo" name="modelo" placeholder="Grand i10" />
          <Field label="Año" name="anio" type="number" placeholder="2020" />
          <Field label="Km actual" name="km_actual" type="number" placeholder="0" />
          <Select label="Estado" name="estado" options={ESTADOS} defaultValue="activo" />
          <div className="flex items-end">
            <SubmitButton>Guardar vehículo</SubmitButton>
          </div>
        </FormCard>
      </div>

      <h2 className="mt-10 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {vehiculos.length} vehículo{vehiculos.length === 1 ? "" : "s"}
      </h2>

      {error ? (
        <p className="mt-4 rounded-xl bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line/60">
          {error}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-surface ring-1 ring-line/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Carro</th>
                <th className="px-5 py-3">Vehículo</th>
                <th className="px-5 py-3">Año</th>
                <th className="px-5 py-3">Km</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-semibold tabular-nums">
                    {v.empresa?.codigo ? `${v.empresa.codigo} · ` : ""}
                    {v.numero}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted">{v.anio ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">
                    {v.km_actual != null ? v.km_actual.toLocaleString("es-PA") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusChip tone={estadoTone(v.estado)}>{estadoLabel(v.estado)}</StatusChip>
                  </td>
                </tr>
              ))}
              {vehiculos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    Aún no hay vehículos. Agrega el primero arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
