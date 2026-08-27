import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { Field, Select, SubmitButton, FormCard } from "@/components/form";
import { createTarifa } from "./actions";

export const dynamic = "force-dynamic";

type Empresa = { id: string; codigo: string; nombre: string };
type Tarifa = {
  id: string;
  modelo: string | null;
  anio: number | null;
  km_min: number;
  km_max: number;
  letra_diaria: number;
  vigente: boolean;
  empresa: { codigo: string } | null;
};

const KM_MAX = 2147483647;

async function getData() {
  try {
    const sb = createServerSupabase();
    const [emp, tar] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("tarifas")
        .select("id, modelo, anio, km_min, km_max, letra_diaria, vigente, empresa:empresas(codigo)")
        .order("letra_diaria"),
    ]);
    if (emp.error) throw emp.error;
    if (tar.error) throw tar.error;
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      tarifas: (tar.data as unknown as Tarifa[]) ?? [],
      error: null as string | null,
    };
  } catch (e) {
    return { empresas: [], tarifas: [], error: e instanceof Error ? e.message : "Error" };
  }
}

function rangoKm(min: number, max: number): string {
  const lo = min > 0 ? min.toLocaleString("es-PA") : "0";
  const hi = max < KM_MAX ? max.toLocaleString("es-PA") : "∞";
  return `${lo} – ${hi}`;
}

export default async function TarifarioPage() {
  const { empresas, tarifas, error } = await getData();
  const empOptions = [
    { value: "", label: "Todas las empresas" },
    ...empresas.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <PageHeader
        eyebrow="Cartera"
        title="Tarifario"
        subtitle="Letra diaria según empresa, año, modelo y rango de km. Deja campos vacíos para reglas generales."
      />

      <div className="mt-8">
        <FormCard action={createTarifa}>
          <Select label="Empresa" name="empresa_id" options={empOptions} defaultValue="" />
          <Field label="Modelo" name="modelo" placeholder="Grand i10 (o vacío = todos)" />
          <Field label="Año" name="anio" type="number" placeholder="2020 (o vacío)" />
          <Field label="Km desde" name="km_min" type="number" placeholder="0" />
          <Field label="Km hasta" name="km_max" type="number" placeholder="10000 (o vacío = ∞)" />
          <Field label="Letra diaria (USD) *" name="letra_diaria" type="number" required placeholder="35" />
          <div className="flex items-end">
            <SubmitButton>Guardar tarifa</SubmitButton>
          </div>
        </FormCard>
      </div>

      <h2 className="mt-10 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {tarifas.length} tarifa{tarifas.length === 1 ? "" : "s"}
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
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Modelo</th>
                <th className="px-5 py-3">Año</th>
                <th className="px-5 py-3">Km</th>
                <th className="px-5 py-3">Letra diaria</th>
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{t.empresa?.codigo ?? "Todas"}</td>
                  <td className="px-5 py-3 text-muted">{t.modelo ?? "Cualquiera"}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">{t.anio ?? "Cualquiera"}</td>
                  <td className="px-5 py-3 font-mono tabular-nums text-muted">
                    {rangoKm(t.km_min, t.km_max)}
                  </td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-gold">
                    ${t.letra_diaria}
                  </td>
                </tr>
              ))}
              {tarifas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    Aún no hay tarifas. Agrega la primera arriba (ej. $25 para carro 2020).
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
