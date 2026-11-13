import { PageHeader, PageShell } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { actualizarDatosCliente } from "@/app/cartera/clientes/actions";
import { EditorClientes, type FichaCliente } from "./editor";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  nombre: string;
  telefono: string | null;
  whatsapp: string | null;
  numero_licencia?: string | null;
  categoria_licencia?: string | null;
  fecha_nacimiento?: string | null;
  fecha_vencimiento_licencia?: string | null;
};

export default async function ClientesComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const buscar = (q ?? "").trim();
  let filas: Fila[] = [];
  let error: string | null = null;
  if (buscar.length >= 2) {
    const sb = createServerSupabase();
    const pedido = await sb
      .from("clientes")
      .select("id, nombre, telefono, whatsapp, numero_licencia, categoria_licencia, fecha_nacimiento, fecha_vencimiento_licencia")
      .ilike("nombre", `%${buscar}%`)
      .order("nombre")
      .limit(15);
    if (pedido.error && /categoria_licencia|numero_licencia|fecha_nacimiento/i.test(pedido.error.message)) {
      const corto = await sb
        .from("clientes")
        .select("id, nombre, telefono, whatsapp")
        .ilike("nombre", `%${buscar}%`)
        .order("nombre")
        .limit(15);
      filas = (corto.data ?? []) as Fila[];
      error = corto.error?.message ?? null;
    } else {
      filas = (pedido.data ?? []) as Fila[];
      error = pedido.error?.message ?? null;
    }
  }
  const clientes: FichaCliente[] = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    whatsapp: f.whatsapp,
    numeroLicencia: f.numero_licencia ?? null,
    categoria: f.categoria_licencia ?? null,
    nacimiento: f.fecha_nacimiento ?? null,
    vence: f.fecha_vencimiento_licencia ?? null,
  }));

  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Datos del cliente"
        subtitle="Corregí nombre, teléfono, licencia y fechas. Las fechas van en dd/mm/aaaa."
      />
      <form className="mb-6 flex gap-2" action="/comercial/clientes">
        <input
          name="q"
          defaultValue={buscar}
          placeholder="Nombre del cliente"
          className="w-full max-w-sm rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line"
        />
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
          Buscar
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-rojo">{error}</p>}
      {buscar.length < 2 ? (
        <p className="text-sm text-muted">Escribí al menos dos letras del nombre.</p>
      ) : (
        <EditorClientes clientes={clientes} action={actualizarDatosCliente} />
      )}
    </PageShell>
  );
}
