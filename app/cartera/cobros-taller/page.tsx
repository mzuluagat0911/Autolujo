import { PageHeader, PageShell } from "@/components/kit";
import { ChapisteriaVista } from "@/app/operaciones/chapisteria/vista";

export const dynamic = "force-dynamic";

/**
 * Misma fuente de verdad que /operaciones/chapisteria.
 * Enlace pensado para Cartera: qué ítem cobrar y a qué precio
 * cuando hay mantenimiento / novedad / chapistería.
 */
export default function CobrosTallerPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Cartera"
        title="Cobros de taller"
        subtitle="Ítems y valores a cobrar por chapistería o novedad (Grand i10 / Soluto). Contado −20% en reparadas; piezas nuevas +40% si el carro tiene ≥ 50.000 km. El mantenimiento FULL y el kit de tiempo los confirma el taller — acá no inventamos ese monto."
      />
      <div className="mt-4 rounded-xl bg-ambar-wash px-4 py-3 text-sm text-ambar ring-1 ring-ambar/20">
        <p className="font-medium">Uso de Cartera</p>
        <p className="mt-1 text-ink/80">
          Cuando Operaciones manda un carro a chapistería o reporta una novedad, usá esta tabla
          para armar el cargo al contrato. Multa por no asistir a cita de mantenimiento:{" "}
          <span className="font-semibold tabular-nums">$10</span>. El agente de WhatsApp no cotiza
          estos precios; los confirma el equipo.
        </p>
      </div>
      <ChapisteriaVista />
    </PageShell>
  );
}
