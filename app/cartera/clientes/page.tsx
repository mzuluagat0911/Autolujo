import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { createCliente, createClienteConContrato, listarCarrosLibres } from "./actions";
import { ClientesDirectorio, type ClienteFila } from "./directorio";

export const dynamic = "force-dynamic";

async function getClientes(): Promise<{ data: ClienteFila[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("clientes")
      .select("id, nombre, genero, cedula, telefono, whatsapp, score_financiero, activo")
      .order("nombre");
    if (error) throw error;
    return { data: (data as ClienteFila[]) ?? [], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function ClientesPage() {
  const [{ data, error }, carros] = await Promise.all([getClientes(), listarCarrosLibres()]);

  return (
    <ClientesDirectorio
      clientes={data}
      error={error}
      carros={carros}
      fechaHoy={hoyPanama()}
      createCliente={createCliente}
      createClienteConContrato={createClienteConContrato}
    />
  );
}
