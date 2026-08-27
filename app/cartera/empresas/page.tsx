import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Empresa = {
  id: string;
  codigo: string;
  nombre: string;
  prefijo_carro: string | null;
  rango_min: number | null;
  rango_max: number | null;
};

async function getEmpresas(): Promise<{ data: Empresa[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("empresas")
      .select("id, codigo, nombre, prefijo_carro, rango_min, rango_max")
      .order("codigo");
    if (error) throw error;
    return { data: (data as Empresa[]) ?? [], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function EmpresasPage() {
  const { data, error } = await getEmpresas();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/" className="font-mono text-xs text-muted hover:text-brand">
        ← Volver
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Empresas</h1>
      <p className="mt-1 text-sm text-muted">
        Las 3 empresas del grupo. La numeración de carros no se repite entre ellas.
      </p>

      {error ? (
        <p className="mt-8 rounded-lg border border-line bg-surface p-4 font-mono text-xs text-muted">
          {error}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left font-mono text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Rango de carros</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-b border-line bg-surface last:border-0">
                  <td className="px-5 py-3 font-semibold">{e.codigo}</td>
                  <td className="px-5 py-3">{e.nombre}</td>
                  <td className="px-5 py-3 font-mono tabular-nums text-muted">
                    {e.prefijo_carro}
                    {e.rango_min}–{e.prefijo_carro}
                    {e.rango_max}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-muted">
                    Sin empresas. ¿Ejecutaste el schema en Supabase?
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
