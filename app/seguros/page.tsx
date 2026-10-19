import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { listarCasos, listarPolizas, polizasPorVencer } from "@/lib/seguros/datos";
import { Tablero } from "./tablero";

export const dynamic = "force-dynamic";

const SECUNDARIO =
  "inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2";
const PRIMARIO = "inline-flex rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black";

export default async function SegurosPage() {
  const hoy = hoyPanama();
  const esteMes = hoy.slice(0, 7);
  const mesPasado = sumarDias(`${esteMes}-01`, -1).slice(0, 7);
  let error: string | null = null;
  let casos: Awaited<ReturnType<typeof listarCasos>> = [];
  let porVencer = 0;
  try {
    const [lista, polizas] = await Promise.all([listarCasos(), listarPolizas()]);
    casos = lista;
    porVencer = polizasPorVencer(polizas, hoy).length;
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer los casos.";
  }

  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader
        eyebrow="Seguros"
        title="Choques"
        subtitle="Un caso por choque. Seguí en qué va: oficina, audiencia, facturas, reclamo o pago."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/seguros/polizas" className={SECUNDARIO}>
              Pólizas
            </Link>
            <Link href="/seguros/nuevo" className={PRIMARIO}>
              Registrar choque
            </Link>
          </div>
        }
      />
      {error ? (
        <p className="rounded-xl bg-rojo-wash px-4 py-3 text-sm text-rojo">{error}</p>
      ) : (
        <Tablero
          casos={casos}
          polizasPorVencer={porVencer}
          hoy={hoy}
          esteMes={esteMes}
          mesPasado={mesPasado}
        />
      )}
    </div>
  );
}
