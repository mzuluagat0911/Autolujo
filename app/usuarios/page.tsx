import { redirect } from "next/navigation";
import { Kpi, PageHeader, StatusChip } from "@/components/kit";
import { casaDe, parseRol } from "@/lib/equipo/modulos";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { cambiarActivo } from "./actions";
import { AltaUsuario } from "./alta";
import { EditorModulos } from "./editor";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
};

export default async function UsuariosPage() {
  const yo = await sesionEquipo();
  if (!yo) redirect("/ingreso");
  if (!yo.modulos.includes("equipo")) redirect(casaDe(yo.modulos));

  const sb = createServerSupabase();
  const { data, error } = await sb.from("equipo").select("id, email, nombre, rol, activo").order("nombre");
  const filas = (data ?? []) as Fila[];
  const activos = filas.filter((u) => u.activo).length;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Configuración"
        title="Usuarios y módulos"
        subtitle="Cada casilla es una parte del menú. Si no está marcada, esa persona no entra ahí ni recibe sus avisos."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="En el equipo" value={filas.length} />
        <Kpi label="Activos" value={activos} tone={activos > 0 ? "good" : "default"} />
      </div>

      <div className="mt-8">
        <AltaUsuario />
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">{error.message}</p>
      )}

      <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Equipo · {filas.length}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Correo</th>
              <th className="px-5 py-3">Módulos</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filas.map((u) => {
              const modulos = parseRol(u.rol);
              return (
                <tr key={u.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-3 font-medium">
                    {u.nombre}
                    {u.id === yo.id ? <span className="ml-2 text-xs text-muted">usted</span> : null}
                  </td>
                  <td className="px-5 py-3 text-muted">{u.email}</td>
                  <td className="px-5 py-3">
                    {u.id === yo.id ? (
                      <div className="flex flex-wrap gap-1">
                        {modulos.map((id) => (
                          <StatusChip key={id} tone="azul">
                            {id}
                          </StatusChip>
                        ))}
                      </div>
                    ) : (
                      <EditorModulos key={modulos.join(",")} id={u.id} actuales={modulos} />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusChip tone={u.activo ? "good" : "neutral"}>
                      {u.activo ? "activo" : "sin acceso"}
                    </StatusChip>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== yo.id && (
                      <form action={cambiarActivo}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="activo" value={u.activo ? "0" : "1"} />
                        <button
                          type="submit"
                          className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          {u.activo ? "Quitar acceso" : "Reactivar"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted">
                  Aún no hay nadie. Cree el primer acceso arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
