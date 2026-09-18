"use client";

import { useState, type ReactNode } from "react";
import { Money, StatusChip, Tabs, EmptyState } from "@/components/kit";
import { lineaSalidaCruce, type SalidaHoyVista } from "@/lib/cartera/salidas-aplicar";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { SubirExtracto } from "./uploader";
import { ColaRevision, type MovimientoRevision } from "./cola";
import { PagoManualForm } from "../pagos/pago-manual-form";

type Empresa = { id: string; codigo: string; nombre: string };
type ExtractoReciente = {
  id: string;
  fecha: string;
  created_at: string;
  empresa: { codigo: string } | null;
};

type TabId = "revision" | "subir" | "historial";

export function ExtractosTabs({
  empresas,
  recientes,
  revision,
  salidasBanco,
}: {
  empresas: Empresa[];
  recientes: ExtractoReciente[];
  revision: MovimientoRevision[];
  salidasBanco: SalidaHoyVista[];
}) {
  const [tab, setTab] = useState<TabId>(
    revision.length > 0 || salidasBanco.length > 0 ? "revision" : "subir",
  );

  return (
    <div className="mt-6 space-y-6">
      <Tabs
        tabs={[
          { id: "revision", label: "Revisión", count: revision.length + salidasBanco.length },
          { id: "subir", label: "Subir" },
          { id: "historial", label: "Historial", count: recientes.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === "revision" && (
        <div className="space-y-10">
          {salidasBanco.length > 0 && (
            <Panel
              title={`Salidas al interior · por cruzar · ${salidasBanco.length}`}
              hint="Ya hay comprobante y aval. Al subir el extracto, si calza carro + monto + fecha, se cruza solo."
            >
              <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
                {salidasBanco.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{lineaSalidaCruce(s)}</span>
                      <StatusChip tone="warn">pendiente</StatusChip>
                    </div>
                    <span className="tabular-nums font-semibold">
                      <Money amount={s.monto} />
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title={`Por revisar · ${revision.length}`}
            hint="Aplicar ancla el movimiento a un carro. Ignorar lo saca de la cola sin mover el saldo."
          >
            <ColaRevision movimientos={revision} />
          </Panel>
        </div>
      )}

      {tab === "subir" && (
        <div className="space-y-10">
          <Panel
            title="Pago en oficina"
            hint="Efectivo o datáfono. Se ancla al número de carro y, si puede, se avisa por WhatsApp."
          >
            <PagoManualForm abiertoPorDefecto />
          </Panel>

          <Panel
            title="Extracto bancario"
            hint="Elegí la empresa y subí el Excel o PDF de Banco General. Lo que calce se aplica; el resto va a Revisión."
          >
            {empresas.length === 0 ? (
              <EmptyState
                title="No hay empresas cargadas"
                hint="Revisá el schema en Supabase."
              />
            ) : (
              <SubirExtracto empresas={empresas} />
            )}
          </Panel>
        </div>
      )}

      {tab === "historial" &&
        (recientes.length === 0 ? (
          <EmptyState
            title="Sin extractos todavía"
            hint="Cuando subás un PDF o Excel, aparece acá."
            action={
              <button
                type="button"
                onClick={() => setTab("subir")}
                className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
              >
                Subir extracto
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            {recientes.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">
                  {siglaEmpresa(e.empresa?.codigo) || "—"} · {e.fecha}
                </span>
                <span className="text-[11px] tabular-nums text-muted">
                  {new Date(e.created_at).toLocaleString("es-PA", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">{hint}</p>
      {children}
    </section>
  );
}
