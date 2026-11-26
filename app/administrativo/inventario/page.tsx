import { PageHeader, PageShell } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  etiquetaSedeInventario,
  normalizarRubro,
  normalizarSedeInventario,
  type RubroInventario,
  type SedeInventario,
} from "@/lib/administrativo/inventario";
import { listarInventario, listarMovimientos } from "../actions";
import { InventarioVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; rubro?: string }>;
}) {
  const sp = await searchParams;
  const sede = (normalizarSedeInventario(sp.sede) ?? "juan_diaz") as SedeInventario;
  const rubroRaw = String(sp.rubro ?? "todos").trim();
  const rubro = (rubroRaw === "todos" ? "todos" : normalizarRubro(rubroRaw) ?? "todos") as
    | RubroInventario
    | "todos";

  const [inv, mov] = await Promise.all([
    listarInventario({ sede, rubro: "todos" }),
    listarMovimientos({ sede }),
  ]);

  const error = !inv.ok ? inv.error : !mov.ok ? mov.error : null;
  const todas = inv.ok ? inv.filas : [];
  const filas = rubro === "todos" ? todas : todas.filter((f) => f.rubro === rubro);
  const movimientos = mov.ok ? mov.filas : [];
  const conStock = filas.filter((f) => f.cantidad > 0.0005).length;

  return (
    <PageShell width="fluid">
      <PageHeader
        eyebrow="Administrativo"
        title="Inventario"
        subtitle={`Misma lista en ambas sedes. Stock actual en ${etiquetaSedeInventario(sede)} — arranque en 0; Ángela registra entradas, salidas y ajustes.`}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Con stock
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{conStock}</p>
          </div>
        }
      />
      <InventarioVista
        sede={sede}
        rubro={rubro}
        filas={todas}
        filasFiltradas={filas}
        movimientos={movimientos}
        fechaHoy={hoyPanama()}
        error={error}
      />
    </PageShell>
  );
}
