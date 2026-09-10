import { PageHeader, StatusChip } from "@/components/kit";
import { Field, Select, FormCard, SubmitButton } from "@/components/form";
import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaGenero } from "@/lib/cartera/tratamiento";
import { hoyPanama } from "@/lib/cartera/fecha";
import { createCliente, createClienteConContrato, listarCarrosLibres } from "./actions";
import { AltaContratoForm } from "./alta-contrato";

export const dynamic = "force-dynamic";

type Cliente = {
  id: string;
  nombre: string;
  genero: string | null;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  score_financiero: number;
  activo: boolean;
};

async function getClientes(): Promise<{ data: Cliente[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("clientes")
      .select("id, nombre, genero, cedula, telefono, whatsapp, score_financiero, activo")
      .order("nombre");
    if (error) throw error;
    return { data: (data as Cliente[]) ?? [], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function ClientesPage() {
  const [{ data, error }, carros] = await Promise.all([getClientes(), listarCarrosLibres()]);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Directorio"
        title="Clientes"
        subtitle="Alta con género (Sr./Sra.) y, si aplica, contrato automático atado a un carro libre."
      />

      <div className="mt-6 space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Cliente + contrato + carro</h2>
          <p className="mb-4 text-sm text-muted">
            Crea la persona, elige un carro libre y queda el contrato activo enlazado en la
            plataforma (y el chat de WhatsApp si el número ya existe).
          </p>
          <AltaContratoForm carros={carros} fechaHoy={hoyPanama()} action={createClienteConContrato} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Solo cliente</h2>
          <FormCard action={createCliente}>
            <Field label="Nombre *" name="nombre" required placeholder="Juan Pérez" />
            <Select
              label="Género / tratamiento *"
              name="genero"
              required
              placeholder="Elegí…"
              options={[
                { value: "m", label: "Masculino — Sr." },
                { value: "f", label: "Femenino — Sra." },
              ]}
            />
            <Field label="Cédula" name="cedula" placeholder="8-888-8888" />
            <Field label="Teléfono" name="telefono" placeholder="6000-0000" />
            <Field label="WhatsApp" name="whatsapp" placeholder="+50760000000" />
            <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
              <input type="checkbox" name="mayor_de_25" className="h-4 w-4" />
              Mayor de 25 años
            </label>
            <div className="flex items-end sm:col-span-2">
              <SubmitButton>Guardar cliente</SubmitButton>
            </div>
          </FormCard>
        </section>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {data.length} cliente{data.length === 1 ? "" : "s"}
      </h2>
      {error ? (
        <p className="mt-4 rounded-xl bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">
          {error}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Trato</th>
                <th className="px-5 py-3">Cédula</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-line bg-surface last:border-0">
                  <td className="px-5 py-3 font-medium">{c.nombre}</td>
                  <td className="px-5 py-3">
                    {c.genero ? (
                      <StatusChip tone={c.genero === "f" ? "purpura" : "azul"}>
                        {etiquetaGenero(c.genero)}
                      </StatusChip>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">{c.cedula ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-muted">{c.whatsapp ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{c.score_financiero}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    Aún no hay clientes. Creá el primero arriba.
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
