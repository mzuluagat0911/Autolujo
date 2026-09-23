"use client";

import { useMemo, useState } from "react";
import { FiltersBar, StatusChip, Money, EmptyState } from "@/components/kit";
import {
  money,
  textoEstadoCuotas,
  textoSituacionCuotas,
  esAdelantado,
  esAlDiaHoy,
  gravedadSituacion,
  type EstadoCuenta,
} from "@/lib/cartera/estado-cuenta";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { DetalleEstadoModal } from "./detalle";
import type { EstadoCuentaFila } from "./types";

type Filtro = "todas" | "pendiente" | "recargo" | "aldia" | "adelantado";
type OrdenCol =
  | "carro"
  | "cliente"
  | "valor"
  | "recargo"
  | "cuotas"
  | "totalHoy";

function tonoSituacion(e: EstadoCuenta): "good" | "warn" | "crit" | "azul" {
  if (e.pendiente) return "azul";
  if (esAdelantado(e)) return "azul";
  if (esAlDiaHoy(e)) return "good";
  if (e.pendienteAnterior > 0.009) return "crit";
  return "warn";
}

function recargoMostrado(e: EstadoCuenta): number {
  // Adelantado / al día: no mostrar amenaza ni multa de “no pago” de hoy.
  if (esAdelantado(e) || esAlDiaHoy(e)) {
    return e.recargosAcumulados > 0.009 ? e.recargosAcumulados : 0;
  }
  if (e.recargosAcumulados > 0.009) return e.recargosAcumulados;
  if (e.recargo > 0.009) return e.recargo;
  if (e.recargoSiTarda > 0.009) return e.recargoSiTarda;
  return 0;
}

function tieneRecargoVisible(e: EstadoCuenta): boolean {
  return recargoMostrado(e) > 0.009;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function EstadosTabla({ estados }: { estados: EstadoCuentaFila[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [orden, setOrden] = useState<OrdenCol>("totalHoy");
  const [asc, setAsc] = useState(false);
  const [detalle, setDetalle] = useState<EstadoCuentaFila | null>(null);

  function clickCabecera(col: OrdenCol) {
    if (orden === col) {
      setAsc((v) => !v);
      return;
    }
    setOrden(col);
    // Situación / montos: más delicado (mayor) primero. Texto: A→Z.
    setAsc(col === "carro" || col === "cliente");
  }

  const contadores = useMemo(() => {
    let pendiente = 0;
    let recargo = 0;
    let aldia = 0;
    let adelantado = 0;
    for (const e of estados) {
      if (esAdelantado(e)) adelantado++;
      else if (esAlDiaHoy(e)) aldia++;
      else pendiente++;
      if (tieneRecargoVisible(e)) recargo++;
    }
    return { pendiente, recargo, aldia, adelantado };
  }, [estados]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filas = estados.filter((e) => {
      if (filtro === "pendiente" && (esAdelantado(e) || esAlDiaHoy(e))) return false;
      if (filtro === "aldia" && !esAlDiaHoy(e)) return false;
      if (filtro === "adelantado" && !esAdelantado(e)) return false;
      if (filtro === "recargo" && !tieneRecargoVisible(e)) return false;
      if (!needle) return true;
      const blob = [
        e.vehiculoNumero,
        e.clienteNombre,
        e.empresa,
        etiquetaCarroUi(e.empresa, e.vehiculoNumero),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });

    const dir = asc ? 1 : -1;
    filas.sort((a, b) => {
      let r = 0;
      switch (orden) {
        case "carro":
          r = cmpStr(
            etiquetaCarroUi(a.empresa, a.vehiculoNumero),
            etiquetaCarroUi(b.empresa, b.vehiculoNumero),
          );
          break;
        case "cliente":
          r = cmpStr(a.clienteNombre, b.clienteNombre);
          break;
        case "valor":
          r = a.letra - b.letra;
          break;
        case "recargo":
          r = recargoMostrado(a) - recargoMostrado(b);
          break;
        case "cuotas":
          r = (a.cuotasDebe ?? 0) - (b.cuotasDebe ?? 0);
          break;
        case "totalHoy":
        default:
          // Más delicado = quien más debe.
          r = gravedadSituacion(a) - gravedadSituacion(b);
          break;
      }
      return r * dir;
    });
    return filas;
  }, [estados, q, filtro, orden, asc]);

  function Cabecera({
    col,
    label,
    align = "left",
  }: {
    col: OrdenCol;
    label: string;
    align?: "left" | "right";
  }) {
    const activo = orden === col;
    const flecha = activo ? (asc ? " ↑" : " ↓") : "";
    return (
      <th
        className={`px-4 py-3 font-medium whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => clickCabecera(col)}
          className={`inline-flex items-center gap-0.5 uppercase tracking-[0.1em] transition-colors hover:text-ink ${
            activo ? "text-ink" : "text-muted"
          }`}
          title={
            col === "totalHoy"
              ? activo
                ? asc
                  ? "Menos delicado → más (clic para invertir)"
                  : "Más delicado primero · quien más debe (clic para invertir)"
                : "Ordenar por gravedad (quien más debe)"
              : activo
                ? asc
                  ? "Menor → mayor (clic para invertir)"
                  : "Mayor → menor (clic para invertir)"
                : "Ordenar"
          }
        >
          {label}
          <span className="tabular-nums text-[10px]">{flecha || " ↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar carro o cliente…"
        chips={[
          { id: "todas", label: "Todas", count: estados.length },
          { id: "pendiente", label: "Pendiente", count: contadores.pendiente },
          { id: "recargo", label: "Con recargo", count: contadores.recargo },
          { id: "aldia", label: "Al día", count: contadores.aldia },
          { id: "adelantado", label: "Adelantado", count: contadores.adelantado },
        ]}
        activeChip={filtro}
        onChip={(id) => setFiltro(id as Filtro)}
        actions={
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de{" "}
            {estados.length}
          </p>
        }
      />

      {visibles.length === 0 ? (
        <EmptyState title="Ningún carro coincide" hint="Probá otro filtro o búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-[11px]">
                <Cabecera col="carro" label="Carro" />
                <Cabecera col="cliente" label="Cliente" />
                <Cabecera col="valor" label="Valor" align="right" />
                <Cabecera col="recargo" label="Recargo" align="right" />
                <Cabecera col="cuotas" label="Estado cuotas" />
                <Cabecera col="totalHoy" label="Situación" />
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 250).map((e) => (
                <tr
                  key={e.contratoId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetalle(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setDetalle(e);
                    }
                  }}
                  className="group cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  title="Ver detalle del estado de cuenta"
                >
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                    {etiquetaCarroUi(e.empresa, e.vehiculoNumero)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink underline-offset-2 group-hover:underline">
                      {e.clienteNombre}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {e.letra > 0.009 ? <Money amount={e.letra} /> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ambar">
                    {esAdelantado(e) || esAlDiaHoy(e) ? (
                      e.recargosAcumulados > 0.009 ? (
                        <Money amount={e.recargosAcumulados} />
                      ) : (
                        "—"
                      )
                    ) : e.recargosAcumulados > 0.009 ? (
                      <Money amount={e.recargosAcumulados} />
                    ) : e.recargo > 0.009 ? (
                      <Money amount={e.recargo} />
                    ) : e.recargoSiTarda > 0.009 ? (
                      <span
                        className="text-xs text-muted"
                        title="Si no completa antes de las 7 p.m."
                      >
                        +<Money amount={e.recargoSiTarda} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                    <span className="font-medium text-ink">{textoEstadoCuotas(e)}</span>
                    {e.numCuotasTotal != null && (
                      <p className="mt-0.5 text-[11px] text-muted">
                        de {e.numCuotasTotal.toLocaleString("es-PA")} totales
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip tone={tonoSituacion(e)}>{textoSituacionCuotas(e)}</StatusChip>
                    {esAdelantado(e) ? (
                      <p className="mt-1 text-[11px] text-muted tabular-nums">
                        {e.diasAdelantados} cuota{e.diasAdelantados === 1 ? "" : "s"} por delante
                        {fechaCorta(e.cubiertoHasta)
                          ? ` · cubierto hasta ${fechaCorta(e.cubiertoHasta)}`
                          : ""}
                      </p>
                    ) : esAlDiaHoy(e) ? (
                      e.acuerdoHoy > 0.009 ? (
                        <p className="mt-1 text-[11px] text-muted tabular-nums">
                          Acuerdo pendiente {money(e.acuerdoHoy)}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted">Letra del día cubierta</p>
                      )
                    ) : (
                      <p className="mt-1 text-[11px] font-medium tabular-nums text-ink">
                        A pagar hoy {money(e.totalHoy)}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <DetalleEstadoModal estado={detalle} onClose={() => setDetalle(null)} />
      )}
    </div>
  );
}
