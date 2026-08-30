import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { createCliente } from "./actions";

export const dynamic = "force-dynamic";

type Cliente = {
  id: string;
  nombre: string;
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
      .select("id, nombre, cedula, telefono, whatsapp, score_financiero, activo")
      .order("nombre");
    if (error) throw error;
    return { data: (data as Cliente[]) ?? [], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function ClientesPage() {
  const { data, error } = await getClientes();

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Directorio"
        title="Clientes"
        subtitle="Alta y consulta. El WhatsApp va en formato internacional (+507…)."
      />

      {/* Formulario de alta */}
      <form
        action={createCliente}
        className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-6 sm:grid-cols-2"
      >
        <Field label="Nombre *" name="nombre" required placeholder="Juan Pérez" />
        <Field label="Cédula" name="cedula" placeholder="8-888-8888" />
        <Field label="Teléfono" name="telefono" placeholder="6000-0000" />
        <Field label="WhatsApp" name="whatsapp" placeholder="+5076000000" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="mayor_de_25" className="h-4 w-4 accent-brand" />
          Mayor de 25 años
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Guardar cliente
          </button>
        </div>
      </form>

      {/* Listado */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {data.length} cliente{data.length === 1 ? "" : "s"}
      </h2>
      {error ? (
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 font-mono text-xs text-muted">
          {error}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left font-mono text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Cédula</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-line bg-surface last:border-0">
                  <td className="px-5 py-3 font-medium">{c.nombre}</td>
                  <td className="px-5 py-3 text-muted">{c.cedula ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-muted">{c.whatsapp ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{c.score_financiero}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted">
                    Aún no hay clientes. Crea el primero arriba.
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

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}
