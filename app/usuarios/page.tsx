import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { PageHeader, StatusChip, Kpi } from "@/components/kit";
import { cambiarActivo, cambiarRol } from "./actions";
import { AltaUsuario } from "./alta";

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
  if (yo.rol !== "admin") redirect("/cartera");

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("equipo")
    .select("id, email, nombre, rol, activo")
    .order("nombre");
  const filas = (data ?? []) as Fila[];
  const activos = filas.filter((u) => u.activo).length;
  const admins = filas.filter((u) => u.rol === "admin" && u.activo).length;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Configuración"
        title="Usuarios y roles"
        subtitle="Quién entra a la plataforma. Los arrendatarios no tienen usuario: hablan por WhatsApp."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="En el equipo" value={filas.length} />
        <Kpi label="Activos" value={activos} tone={activos > 0 ? "good" : "default"} />
        <Kpi label="Administradores" value={admins} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Rol cartera</p>
          <p className="mt-2 text-sm text-ink">
            Panel, estados de cuenta, conversaciones, pagos, conciliación, carros, rastreo, clientes
            y tarifario.
          </p>
        </div>
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Rol admin</p>
          <p className="mt-2 text-sm text-ink">
            Todo lo de cartera, más crear o quitar accesos y cambiar roles en esta pantalla.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <AltaUsuario />
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">
          {error.message}
          {" · "}
          Si dice que no existe la tabla, pegue la migración 0021 en Supabase.
        </p>
      )}

      <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        2. Equipo actual · {filas.length}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Correo</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filas.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-medium">
                  {u.nombre}
                  {u.id === yo.id ? <span className="ml-2 text-xs text-muted">usted</span> : null}
                </td>
                <td className="px-5 py-3 text-muted">{u.email}</td>
                <td className="px-5 py-3">
                  {u.id === yo.id ? (
                    <StatusChip tone="azul">admin</StatusChip>
                  ) : (
                    <form action={cambiarRol} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select
                        name="rol"
                        defaultValue={u.rol}
                        className="rounded-lg bg-paper px-2 py-1.5 text-sm ring-1 ring-line"
                      >
                        <option value="cartera">cartera</option>
                        <option value="admin">admin</option>
                      </select>
                      <button
                        type="submit"
                        className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        Guardar
                      </button>
                    </form>
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
            ))}
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
