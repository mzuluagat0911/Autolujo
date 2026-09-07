"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip, Money } from "@/components/kit";
import { accionDarAval, asignarPagoASalida, resolverPago } from "./actions";
import { TARIFAS_SALIDA_INTERIOR } from "@/lib/cartera/salidas-interior";
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

type Filtro = "todos" | "banco" | "alerta" | "contrato" | "interior";

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
  const [interiorAbierto, setInteriorAbierto] = useState<string | null>(null);
  const [forzarAbierto, setForzarAbierto] = useState<string | null>(null);

  const counts = useMemo(() => {
    let banco = 0;
    let alerta = 0;
    let contrato = 0;
    let interior = 0;
    for (const p of pendientes) {
      if (p.alertaCuenta) alerta++;
      else if (!p.contrato_id) contrato++;
      else if (p.rubro === "salida_interior" || p.salida) interior++;
      else banco++;
    }
    return { banco, alerta, contrato, interior };
  }, [pendientes]);

  const filas = useMemo(() => {
    return pendientes.filter((p) => {
      if (filtro === "alerta") return p.alertaCuenta;
      if (filtro === "contrato") return !p.contrato_id;
      if (filtro === "interior") return p.rubro === "salida_interior" || Boolean(p.salida);
      if (filtro === "banco") {
        return p.contrato_id && !p.alertaCuenta && !(p.rubro === "salida_interior" || p.salida);
      }
      return true;
    });
  }, [pendientes, filtro]);

  const chips: { id: Filtro; label: string }[] = [
    { id: "todos", label: `Todos (${pendientes.length})` },
    { id: "banco", label: `Esperando banco (${counts.banco})` },
    { id: "alerta", label: `Alerta cuenta (${counts.alerta})` },
    { id: "contrato", label: `Sin contrato (${counts.contrato})` },
    { id: "interior", label: `Interior (${counts.interior})` },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltro(c.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
              filtro === c.id
                ? "bg-ink text-white ring-ink"
                : "bg-surface text-muted ring-line hover:bg-surface-2"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        El cierre con el banco está en{" "}
        <Link href="/cartera/extractos" className="font-medium text-ink underline-offset-2 hover:underline">
          Conciliación
        </Link>
        . Acá solo se revisan excepciones de WhatsApp.
      </p>

      {filas.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface px-5 py-8 text-center text-sm text-muted ring-1 ring-line">
          Nada en este filtro.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          {filas.map((p) => (
            <Fila
              key={p.id}
              p={p}
              contratos={contratos}
              verImg={imgAbierta === p.id}
              onToggleImg={() => setImgAbierta((id) => (id === p.id ? null : p.id))}
              verInterior={interiorAbierto === p.id}
              onToggleInterior={() => setInteriorAbierto((id) => (id === p.id ? null : p.id))}
              verForzar={forzarAbierto === p.id}
              onToggleForzar={() => setForzarAbierto((id) => (id === p.id ? null : p.id))}
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
  verInterior,
  onToggleInterior,
  verForzar,
  onToggleForzar,
}: {
  p: PagoFila;
  contratos: ContratoOpt[];
  verImg: boolean;
  onToggleImg: () => void;
  verInterior: boolean;
  onToggleInterior: () => void;
  verForzar: boolean;
  onToggleForzar: () => void;
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
          <StatusChip tone="warn">sin contrato</StatusChip>
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
            onClick={onToggleInterior}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line hover:bg-surface-2"
          >
            Interior
          </button>
          <button
            type="button"
            onClick={onToggleForzar}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line hover:bg-surface-2"
          >
            Forzar
          </button>
        </div>
      </div>

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

      {verInterior && !p.salida && p.rubro !== "salida_interior" && (
        <form action={asignarPagoASalida} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="hidden" name="pago_id" value={p.id} />
          <input type="hidden" name="monto" value={p.monto} />
          <select name="destino_interior" required defaultValue="" className="rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line">
            <option value="" disabled>
              Destino…
            </option>
            {TARIFAS_SALIDA_INTERIOR.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre} (${d.monto})
              </option>
            ))}
            <option value="otro">Otro…</option>
          </select>
          <input
            name="destino_otro"
            placeholder="Si es otro"
            className="w-32 rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line"
          />
          <input
            name="dias_viaje"
            type="number"
            min={1}
            max={14}
            defaultValue={1}
            className="w-14 rounded-lg bg-paper px-2 py-2 text-sm tabular-nums ring-1 ring-line"
          />
          <button className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black">
            Asignar
          </button>
        </form>
      )}

      {verForzar && (
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
            Salta el extracto bancario. Úsalo solo si ya verificaste el pago a mano.
          </p>
          <button className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black">
            Marcar conciliado
          </button>
        </form>
      )}
    </div>
  );
}
