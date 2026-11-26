import { PageHeader, PageShell } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  etiquetaSedeInventario,
  normalizarRubro,
  normalizarSedeInventario,
  type RubroInventario,
  type SedeInventario,
} from "@/lib/administrativo/inventario";
import {
  listarCobrosPendientes,
  listarInventario,
  listarMovimientos,
  recomendacionesCompra,
} from "../actions";
import { InventarioVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; rubro?: string; presupuesto?: string }>;
}) {
  const sp = await searchParams;
  const sede = (normalizarSedeInventario(sp.sede) ?? "juan_diaz") as SedeInventario;
  const rubroRaw = String(sp.rubro ?? "todos").trim();
  const rubro = (rubroRaw === "todos" ? "todos" : normalizarRubro(rubroRaw) ?? "todos") as
    | RubroInventario
    | "todos";
  const presupuestoRaw = Number(String(sp.presupuesto ?? "").trim());
  const presupuesto =
    Number.isFinite(presupuestoRaw) && presupuestoRaw > 0 ? presupuestoRaw : null;

  const [inv, mov, cobros, reco] = await Promise.all([
    listarInventario({ sede, rubro: "todos" }),
    listarMovimientos({ sede }),
    listarCobrosPendientes({ sede }),
    recomendacionesCompra({ sede, dias: 30, presupuesto }),
  ]);

  const error = !inv.ok
    ? inv.error
    : !mov.ok
      ? mov.error
      : !cobros.ok
        ? cobros.error
        : !reco.ok
          ? reco.error
          : null;
  const todas = inv.ok ? inv.filas : [];
  const filas = rubro === "todos" ? todas : todas.filter((f) => f.rubro === rubro);
  const movimientos = mov.ok ? mov.filas : [];
  const pendientesCobro = cobros.ok ? cobros.filas : [];
  const recomendaciones = reco.ok ? reco.filas : [];

  return (
    <PageShell width="fluid">
      <PageHeader
        eyebrow="Administrativo"
        title="Inventario"
        subtitle={`Stock de ${etiquetaSedeInventario(sede)}. Salida a carro primero; el cobro (cliente o empresa) se asigna después.`}
      />
      <InventarioVista
        sede={sede}
        rubro={rubro}
        filas={todas}
        filasFiltradas={filas}
        movimientos={movimientos}
        pendientesCobro={pendientesCobro}
        recomendaciones={recomendaciones}
        presupuestoInicial={presupuesto != null ? String(presupuesto) : ""}
        fechaHoy={hoyPanama()}
        error={error}
      />
    </PageShell>
  );
}
