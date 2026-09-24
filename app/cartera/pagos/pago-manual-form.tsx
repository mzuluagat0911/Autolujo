"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { registrarPagoManual, type ResultadoPagoManual } from "./actions";
import { hoyPanama, horaPanama } from "@/lib/cartera/fecha";
import { TARIFAS_SALIDA_INTERIOR } from "@/lib/cartera/salidas-interior";
import { RUBROS_PAGO } from "@/lib/cartera/rubros-pago";

const HOY = hoyPanama();
const HORA_AHORA = horaPanama();

export function PagoManualForm({ abiertoPorDefecto = false }: { abiertoPorDefecto?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [estado, accion, pendiente] = useActionState<ResultadoPagoManual | null, FormData>(
    registrarPagoManual,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [rubro, setRubro] = useState("cuenta");
  const esSalida = rubro.startsWith("salida:") || rubro === "otro";
  const destinoId = rubro.startsWith("salida:") ? rubro.slice("salida:".length) : rubro === "otro" ? "otro" : "";
  const tarifa = TARIFAS_SALIDA_INTERIOR.find((d) => d.id === destinoId);

  // Limpiar el formulario tras un registro exitoso.
  useEffect(() => {
    if (estado?.ok) {
      formRef.current?.reset();
      setRubro("cuenta");
    }
  }, [estado?.ok]);

  return (
    <div className="rounded-xl bg-surface ring-1 ring-line">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="text-sm font-semibold">Registrar pago en oficina</span>
          <span className="ml-2 text-xs text-muted">efectivo, tarjeta o transferencia</span>
        </span>
        <span className={`text-muted transition ${abierto ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {abierto && (
        <form ref={formRef} action={accion} className="border-t border-line p-5">
          <input type="hidden" name="destino_interior" value={destinoId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Campo label="Número de carro">
              <input
                name="carro"
                inputMode="numeric"
                placeholder="144"
                required
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            <Campo label="Concepto / rubro">
              <select
                name="rubro"
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <optgroup label="Cuenta">
                  {RUBROS_PAGO.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Salida al interior">
                  {TARIFAS_SALIDA_INTERIOR.map((d) => (
                    <option key={d.id} value={`salida:${d.id}`}>
                      Salida · {d.nombre} (${d.monto})
                    </option>
                  ))}
                  <option value="otro">Salida · otro destino (fuera de tabla)</option>
                </optgroup>
              </select>
            </Campo>
            <Campo label="Monto (USD)">
              <input
                name="monto"
                inputMode="decimal"
                placeholder={tarifa ? String(tarifa.monto) : "60"}
                defaultValue={tarifa ? String(tarifa.monto) : undefined}
                key={rubro || "cuenta"}
                required
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm tabular-nums ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            <Campo label="Método">
              <select
                name="metodo"
                required
                defaultValue=""
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="" disabled>
                  Elige…
                </option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta (datáfono)</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </Campo>
            <Campo label="Referencia">
              <input
                name="referencia"
                placeholder="Opcional"
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            <Campo label="Fecha">
              <input
                type="date"
                name="fecha"
                defaultValue={HOY}
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            {destinoId === "otro" && (
              <Campo label="Destino (escribir)">
                <input
                  name="destino_otro"
                  placeholder="Colón, Bocas…"
                  required
                  className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </Campo>
            )}
            {esSalida && (
              <Campo label="Días del viaje">
                <input
                  name="dias_viaje"
                  type="number"
                  min={1}
                  max={14}
                  defaultValue={1}
                  className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm tabular-nums ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </Campo>
            )}
            <Campo label="Hora (Panamá)">
              <input
                type="time"
                name="hora"
                defaultValue={HORA_AHORA}
                required
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
          </div>
          <p className="mt-2 text-xs text-muted">
            {destinoId === "otro"
              ? "Destino fuera de tabla: el equipo cotiza el monto. Se levanta alerta. El aval queda al registrar."
              : tarifa
                ? `Ese pago va al rubro de salida a ${tarifa.nombre}, no a la cuota. Si es más de un día, póngalo arriba.`
                : rubro === "cuenta"
                  ? "El descuento puntual aplica solo si pagó antes de las 7:00 p.m. de ese día. El sistema reparte el abono (arreglo → atraso → recargo → cuota)."
                  : "Queda marcado con ese concepto. El dinero baja el saldo; el sistema lo reparte según las reglas del día."}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface transition hover:bg-black disabled:opacity-50"
            >
              {pendiente ? "Registrando…" : "Registrar pago"}
            </button>
            {estado && (
              <span className={`text-sm ${estado.ok ? "text-verde" : "text-rojo"}`}>{estado.msg}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
    </label>
  );
}
