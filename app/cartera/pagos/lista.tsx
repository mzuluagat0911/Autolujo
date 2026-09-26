"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip, Money, FiltersBar, EmptyState } from "@/components/kit";
import { accionDarAval, resolverPago } from "./actions";
import type { SalidaFila } from "@/lib/cartera/salidas-aplicar";

export type PagoFila = {
  id: string;
  fecha: string | null;
  monto: number;
  banco: string | null;
  referencia: string | null;
  numero_carro: string | null;
  carroResuelto: string | null;
  estado_conciliacion: string;
  origen?: string | null;
  contrato_id?: string | null;
  contratoLabel?: string | null;
  comprobante_url: string | null;
  notas: string | null;
  created_at: string;
  rubro?: string | null;
  destino_interior?: string | null;
  signedUrl?: string | null;
  salida?: SalidaFila | null;
  alertaCuenta: boolean;
};

export type ContratoOpt = { id: string; label: string };

type Filtro = "todos" | "banco" | "alerta" | "contrato";

function IconOjo({ open }: { open?: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a11.5 11.5 0 01-4.2 5.1M6.1 6.1A11.5 11.5 0 001 12.5C2.7 16.9 7 20 12 20a10.4 10.4 0 005.3-1.4" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z" />
      <circle cx="12" cy="12.5" r="3" />
    </svg>
  );
}

function resumenNotas(notas: string | null): string | null {
  if (!notas) return null;
  const alerta = /ALERTAS:\s*(.+)$/i.exec(notas);
  if (alerta) return alerta[1].trim().slice(0, 120);
  return null;
}

export function ListaComprobantes({
  pendientes,
  contratos,
}: {
  pendientes: PagoFila[];
  contratos: ContratoOpt[];
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [imgAbierta, setImgAbierta] = useState<string | null>(null);
  const [comprobadoAbierto, setComprobadoAbierto] = useState<string | null>(null);

  const counts = useMemo(() => {
    let banco = 0;
    let alerta = 0;
    let contrato = 0;
    for (const p of pendientes) {
      if (p.alertaCuenta) alerta++;
      else if (!p.contrato_id) contrato++;
      else banco++;
    }
    return { banco, alerta, contrato };
  }, [pendientes]);

  const filas = useMemo(() => {
    return pendientes.filter((p) => {
      if (filtro === "alerta") return p.alertaCuenta;
      if (filtro === "contrato") return !p.contrato_id;
      if (filtro === "banco") return Boolean(p.contrato_id) && !p.alertaCuenta;
      return true;
    });
  }, [pendientes, filtro]);

  return (
    <div>
      <FiltersBar
        chips={[
          { id: "todos", label: "Todos", count: pendientes.length },
          { id: "banco", label: "Esperando banco", count: counts.banco },
          { id: "alerta", label: "Alerta cuenta", count: counts.alerta },
          { id: "contrato", label: "Sin contrato", count: counts.contrato },
        ]}
        activeChip={filtro}
        onChip={(id) => setFiltro(id as Filtro)}
      />

      <p className="mt-3 text-sm text-muted">
        El cierre con el banco está en{" "}
        <Link href="/cartera/extractos" className="font-medium text-ink underline-offset-2 hover:underline">
          Conciliación
        </Link>
        . Acá solo se revisan excepciones de WhatsApp.
      </p>

      {filas.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nada en este filtro" hint="No hay comprobantes que coincidan." />
        </div>
      ) : (
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          {filas.map((p) => (
            <Fila
              key={p.id}
              p={p}
              contratos={contratos}
              verImg={imgAbierta === p.id}
              onToggleImg={() => setImgAbierta((id) => (id === p.id ? null : p.id))}
              verComprobado={comprobadoAbierto === p.id}
              onToggleComprobado={() =>
                setComprobadoAbierto((id) => (id === p.id ? null : p.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({
  p,
  contratos,
  verImg,
  onToggleImg,
  verComprobado,
  onToggleComprobado,
}: {
  p: PagoFila;
  contratos: ContratoOpt[];
  verImg: boolean;
  onToggleImg: () => void;
  verComprobado: boolean;
  onToggleComprobado: () => void;
}) {
  const carro = p.carroResuelto ?? p.numero_carro;
  const alertaTxt = resumenNotas(p.notas);
  const necesitaContrato = !p.contrato_id;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-[4.5rem] text-base font-semibold tabular-nums">
          <Money amount={p.monto} />
        </span>

        {p.alertaCuenta ? (
          <StatusChip tone="crit">alerta cuenta</StatusChip>
        ) : !p.contrato_id ? (
          <StatusChip tone="warn">
            {(p.notas ?? "").toLowerCase().includes("no vinculado")
              ? "otro número"
              : "sin contrato"}
          </StatusChip>
        ) : p.rubro === "salida_interior" || p.salida ? (
          <StatusChip tone={p.salida?.estado === "autorizada" ? "good" : "warn"}>
            {p.salida
              ? `interior · ${p.salida.destino}${p.salida.estado === "autorizada" ? " · aval" : ""}`
              : "interior"}
          </StatusChip>
        ) : (
          <StatusChip tone="azul">esperando banco</StatusChip>
        )}

        {carro ? (
          <StatusChip tone="neutral">Carro {carro}</StatusChip>
        ) : (
          <StatusChip tone="warn">sin carro</StatusChip>
        )}

        <span className="text-xs tabular-nums text-muted">
          {p.fecha ?? "—"}
          {p.banco ? ` · ${p.banco}` : ""}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {p.signedUrl && (
            <button
              type="button"
              onClick={onToggleImg}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
              aria-label={verImg ? "Ocultar imagen" : "Ver imagen"}
            >
              <IconOjo open={verImg} />
              {verImg ? "Ocultar" : "Ver imagen"}
            </button>
          )}
          {p.salida?.estado === "pendiente_aval" && (
            <form action={accionDarAval}>
              <input type="hidden" name="salida_id" value={p.salida.id} />
              <button className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black">
                Dar aval
              </button>
            </form>
          )}
          <form action={resolverPago}>
            <input type="hidden" name="pago_id" value={p.id} />
            <input type="hidden" name="accion" value="rechazar" />
            <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash">
              Rechazar
            </button>
          </form>
          <button
            type="button"
            onClick={onToggleComprobado}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line hover:bg-surface-2"
          >
            Pago comprobado
          </button>
        </div>
      </div>

      {p.notas?.includes("EXCEDENTE_SIN_CONCEPTO") && (
        <p className="mt-1.5 text-xs text-ambar">
          Excedente sin concepto. El sábado hay que preguntar si va al domingo o a la letra siguiente antes de aprobar.
        </p>
      )}

      {(alertaTxt || p.referencia || p.contratoLabel) && (
        <p className="mt-1.5 truncate text-xs text-muted">
          {alertaTxt ?? (p.contratoLabel ? p.contratoLabel : null) ?? (p.referencia ? `Ref ${p.referencia}` : null)}
        </p>
      )}

      {verImg && p.signedUrl && (
        <a href={p.signedUrl} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.signedUrl}
            alt="Comprobante"
            className="max-h-64 rounded-lg object-contain ring-1 ring-line"
          />
        </a>
      )}

      {verComprobado && (
        <form
          action={resolverPago}
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3"
        >
          <input type="hidden" name="pago_id" value={p.id} />
          <input type="hidden" name="accion" value="conciliar" />
          {necesitaContrato && (
            <select
              name="contrato_id"
              required
              defaultValue=""
              className="max-w-xs rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line"
            >
              <option value="" disabled>
                Anclar a contrato…
              </option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <p className="w-full text-xs text-ambar sm:w-auto">
            Ya verificaste el dinero en el banco o en Yappy. Se aplica al saldo sin esperar el extracto.
          </p>
          <button className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black">
            Confirmar pago comprobado
          </button>
        </form>
      )}
    </div>
  );
}
