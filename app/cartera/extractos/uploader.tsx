"use client";

import { useActionState, useState } from "react";
import { conciliarExtracto } from "./actions";
import { StatusChip, Money } from "@/components/kit";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import type { ResultadoConciliacion } from "@/lib/cartera/extracto";

type Empresa = { id: string; codigo: string; nombre: string };

function tone(estado: string): "good" | "warn" | "crit" | "neutral" {
  if (estado === "aplicado") return "good";
  if (estado === "parcial") return "warn";
  if (estado === "revisar") return "crit";
  if (estado === "duplicado") return "neutral";
  return "neutral";
}

export function SubirExtracto({ empresas }: { empresas: Empresa[] }) {
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ResultadoConciliacion | null, FormData>(
    conciliarExtracto,
    null,
  );
  const elegida = empresas.find((e) => e.id === empresaId);

  return (
    <div>
      <form action={action} className="rounded-xl bg-surface p-6 ring-1 ring-line">
        <p className="text-sm font-semibold">Empresa del extracto</p>
        <p className="mt-1 text-sm text-muted">
          Solo cruza carros de esa empresa. Auto-aplica si calza carro, monto, fecha y cuenta
          destino; el resto va a la cola de arriba.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {empresas.map((e) => {
            const on = e.id === empresaId;
            return (
              <label
                key={e.id}
                className={`cursor-pointer rounded-xl px-4 py-4 ring-1 transition ${
                  on ? "bg-gris-wash ring-ink" : "bg-white ring-line hover:ring-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="empresa_id"
                  value={e.id}
                  checked={on}
                  onChange={() => setEmpresaId(e.id)}
                  className="sr-only"
                />
                <p className="text-sm font-semibold">{siglaEmpresa(e.codigo)}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{e.nombre}</p>
              </label>
            );
          })}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <label className="block text-sm font-medium">Excel · Banco General</label>
          <p className="mt-1 text-xs text-muted">
            Sube el archivo de movimientos de la cuenta de{" "}
            {elegida ? siglaEmpresa(elegida.codigo) : "la empresa"} (ahorros). También acepta el PDF
            de “Últimos movimientos”. Un archivo por empresa.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg bg-paper px-3 py-2 ring-1 ring-line hover:ring-line-strong">
              <span className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white">
                Seleccionar archivo
              </span>
              <span className="max-w-[14rem] truncate text-sm text-muted">
                {nombreArchivo ?? "Ningún archivo"}
              </span>
              <input
                type="file"
                name="archivo"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                required
                className="sr-only"
                onChange={(e) => setNombreArchivo(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            <button
              type="submit"
              disabled={pending || !empresaId}
              className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
            >
              {pending ? "Conciliando…" : `Conciliar ${elegida?.codigo ?? ""}`}
            </button>
          </div>
        </div>
      </form>

      {state && !state.ok && state.error && (
        <p className="mt-4 rounded-xl bg-rojo-wash px-4 py-3 text-sm text-rojo ring-1 ring-rojo/25">
          {state.error}
        </p>
      )}

      {state?.aviso && (
        <p className="mt-4 rounded-xl bg-ambar-wash px-4 py-3 text-sm text-ambar ring-1 ring-ambar/25">
          {state.aviso}
        </p>
      )}

      {state && state.ok && (
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Resumen label="Movimientos" value={state.total} />
            <Resumen label="Aplicados" value={state.aplicados} tone="good" />
            <Resumen label="Parciales" value={state.parciales} tone="warn" />
            <Resumen label="Por revisar" value={state.revisar} tone={state.revisar > 0 ? "crit" : "neutral"} />
            <Resumen label="Ya vistos" value={state.duplicados} />
          </div>
          <p className="mt-3 text-sm text-muted">
            Cruce contra <b>{siglaEmpresa(state.empresa)}</b> · Solo se aplica con coincidencia perfecta
            (carro + monto + fecha + cuenta). “Ya vistos” no se re-encolan. Total aplicado:{" "}
            <b><Money amount={state.montoAplicado} /></b>
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Carro</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {state.detalle.map((d, i) => (
                  <tr key={i} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-2.5 tabular-nums text-muted">{d.fecha ?? "—"}</td>
                    <td className="px-4 py-2.5">{d.descripcion.slice(0, 60)}</td>
                    <td className="px-4 py-2.5 font-semibold">
                      {d.carro ?? (d.via === "nombre" ? "sugerido" : "—")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><Money amount={d.monto} /></td>
                    <td className="px-4 py-2.5"><StatusChip tone={tone(d.estado)}>{d.estado}</StatusChip></td>
                    <td className="px-4 py-2.5 text-[11px] text-muted">{d.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Resumen({ label, value, tone: t }: { label: string; value: number; tone?: "good" | "warn" | "crit" | "neutral" }) {
  const color = t === "good" ? "text-verde" : t === "warn" ? "text-ambar" : t === "crit" ? "text-rojo" : "text-ink";
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
