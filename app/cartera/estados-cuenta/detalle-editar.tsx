"use client";

import { useCallback, useEffect, useState } from "react";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  FRECUENCIAS_ACUERDO,
  type FrecuenciaAcuerdo,
} from "@/lib/cartera/acuerdo";
import {
  TARIFAS_SALIDA_INTERIOR,
  type DestinoInterior,
} from "@/lib/cartera/salidas-interior";
import {
  cargarLedgerEditable,
  guardarLedgerEditable,
  type AcuerdoDraft,
  type CargoDraft,
  type LedgerEditable,
} from "./actions";

const INPUT =
  "w-full rounded-lg bg-surface px-2.5 py-2 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/20";

const SELECT =
  "w-full rounded-lg bg-surface px-2.5 py-2 text-sm ring-1 ring-line outline-none transition focus:ring-2 focus:ring-ink/20";

const CODIGO_SALIDA = "SALIDA_INT";

function uid() {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

function cargoDesdeDestino(dest: DestinoInterior, fecha: string): CargoDraft & { key: string } {
  return {
    key: uid(),
    id: null,
    fecha,
    tipo: "otras",
    concepto: `Salida al interior — ${dest.nombre}`,
    concepto_codigo: CODIGO_SALIDA,
    monto: dest.monto,
    borrar: false,
  };
}

function destinoIdDesdeConcepto(concepto: string): string {
  const fold = concepto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  for (const d of TARIFAS_SALIDA_INTERIOR) {
    if (fold.includes(d.nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase())) {
      return d.id;
    }
  }
  return TARIFAS_SALIDA_INTERIOR[0]?.id ?? "penonome";
}

function labelCuota(f: FrecuenciaAcuerdo): string {
  switch (f) {
    case "semana":
      return "Cuota / semana";
    case "quincena":
      return "Cuota / quincena";
    case "mes":
      return "Cuota / mes";
    case "fecha":
      return "Monto (fecha)";
    default:
      return "Cuota / día";
  }
}

function hintFrecuencia(f: FrecuenciaAcuerdo): string | null {
  switch (f) {
    case "semana":
      return "Se cobra el mismo día de la semana que la fecha ancla.";
    case "quincena":
      return "Se cobra ese día del mes y 15 días después (o 1 y 15 si no hay ancla).";
    case "mes":
      return "Se cobra el mismo día del mes que la fecha ancla.";
    case "fecha":
      return "Solo se cobra ese día (una vez). Si la cuota es 0, pide todo el saldo.";
    default:
      return null;
  }
}

const TIPOS_CARGO = [
  { value: "otras", label: "Otro / mantenimiento" },
  { value: "multa", label: "Multa / recargo" },
  { value: "panapass", label: "Panapass" },
  { value: "afiliacion", label: "Abono inicial" },
  { value: "siniestro", label: "Siniestro" },
  { value: "ajuste", label: "Ajuste" },
  { value: "exceso_km", label: "Exceso km" },
  { value: "acuerdo", label: "Cargo de acuerdo" },
];

const PRESETS: { label: string; tipo: string; concepto: string; codigo: string | null }[] = [
  { label: "Mantenimiento", tipo: "otras", concepto: "Mantenimiento", codigo: "124" },
  { label: "Acuerdo / arreglo", tipo: "otras", concepto: "Acuerdo de pago", codigo: null },
  { label: "Panapass", tipo: "panapass", concepto: "Panapass", codigo: "PANAPASS" },
  { label: "Domingo", tipo: "otras", concepto: "Domingo", codigo: "DOMINGOS" },
  { label: "Multa no pago", tipo: "multa", concepto: "Pago después de las 7 PM", codigo: "PAGO_TARDE" },
  { label: "Cierre de semana", tipo: "multa", concepto: "No cerrar semana al día", codigo: "CIERRE_SEMANA" },
  { label: "Negociación / ajuste", tipo: "ajuste", concepto: "Ajuste / negociación", codigo: null },
];

export function EditorLedger({
  contratoId,
  onCancel,
  onSaved,
}: {
  contratoId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [letra, setLetra] = useState(0);
  const [numTotal, setNumTotal] = useState<string>("");
  const [pagadas, setPagadas] = useState<string>("");
  const [cargos, setCargos] = useState<(CargoDraft & { key: string })[]>([]);
  const [acuerdos, setAcuerdos] = useState<(AcuerdoDraft & { key: string })[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await cargarLedgerEditable(contratoId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyLedger(res.data);
  }, [contratoId]);

  function applyLedger(data: LedgerEditable) {
    setLetra(data.letraDiaria);
    setNumTotal(data.numCuotasTotal != null ? String(data.numCuotasTotal) : "");
    setPagadas(data.cuotasPagadas != null ? String(data.cuotasPagadas) : "");
    setCargos(
      data.cargos.map((c) => ({
        key: c.id,
        id: c.id,
        fecha: c.fecha,
        tipo: c.tipo,
        concepto: c.concepto,
        concepto_codigo: c.concepto_codigo,
        monto: c.monto,
        borrar: false,
      })),
    );
    setAcuerdos(
      data.acuerdos.map((a) => ({
        key: a.id,
        id: a.id,
        tipo: a.tipo,
        descripcion: a.descripcion,
        saldo: a.saldo,
        cuota_diaria: a.cuota_diaria,
        cuota_domingo: a.cuota_domingo,
        monto_total: a.monto_total,
        activo: a.activo,
        frecuencia: a.frecuencia ?? "dia",
        fecha_especifica: a.fecha_especifica ?? null,
        borrar: false,
      })),
    );
  }

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function addCargo(preset?: (typeof PRESETS)[number]) {
    const hoy = hoyPanama();
    setCargos((prev) => [
      {
        key: uid(),
        id: null,
        fecha: hoy,
        tipo: preset?.tipo ?? "otras",
        concepto: preset?.concepto ?? "",
        concepto_codigo: preset?.codigo ?? null,
        monto: 0,
        borrar: false,
      },
      ...prev,
    ]);
  }

  function addSalidaInterior() {
    const dest = TARIFAS_SALIDA_INTERIOR[0]!;
    setCargos((prev) => [cargoDesdeDestino(dest, hoyPanama()), ...prev]);
  }

  function setDestinoSalida(key: string, destinoId: string) {
    const dest =
      TARIFAS_SALIDA_INTERIOR.find((d) => d.id === destinoId) ?? TARIFAS_SALIDA_INTERIOR[0]!;
    setCargos((prev) =>
      prev.map((x) =>
        x.key === key
          ? {
              ...x,
              concepto_codigo: CODIGO_SALIDA,
              tipo: "otras",
              concepto: `Salida al interior — ${dest.nombre}`,
              monto: dest.monto,
            }
          : x,
      ),
    );
  }

  function addAcuerdo() {
    setAcuerdos((prev) => [
      {
        key: uid(),
        id: null,
        tipo: "otro",
        descripcion: "Acuerdo de pago",
        saldo: 0,
        cuota_diaria: 5,
        cuota_domingo: 30,
        monto_total: 0,
        activo: true,
        frecuencia: "dia",
        fecha_especifica: null,
        borrar: false,
      },
      ...prev,
    ]);
  }

  async function confirmarYGuardar() {
    setSaving(true);
    setError(null);
    const res = await guardarLedgerEditable({
      contratoId,
      letraDiaria: letra,
      numCuotasTotal: numTotal.trim() === "" ? null : Number(numTotal),
      cuotasPagadas: pagadas.trim() === "" ? null : Number(pagadas),
      cargos: cargos.map(({ key: _k, ...c }) => c),
      acuerdos: acuerdos.map(({ key: _k, ...a }) => a),
    });
    setSaving(false);
    setConfirmar(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  if (loading) {
    return <p className="px-5 py-8 text-sm text-muted">Cargando cuenta editable…</p>;
  }

  const cargosVivos = cargos.filter((c) => !c.borrar);
  const acuerdosVivos = acuerdos.filter((a) => !a.borrar);

  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-sm text-muted">
        Cambiá montos, agregá mantenimiento, salida al interior u otros conceptos, o ajustá acuerdos.
        Al guardar se actualiza la base de datos al instante.
      </p>

      {error && (
        <p className="rounded-lg bg-rojo-wash px-3 py-2 text-sm text-rojo">{error}</p>
      )}

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Contrato
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">Letra diaria</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={INPUT}
              value={letra}
              onChange={(e) => setLetra(Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">Cuotas totales</span>
            <input
              type="number"
              step="1"
              min="0"
              className={INPUT}
              value={numTotal}
              onChange={(e) => setNumTotal(e.target.value)}
              placeholder="—"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">Cuotas pagadas</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={INPUT}
              value={pagadas}
              onChange={(e) => setPagadas(e.target.value)}
              placeholder="—"
            />
          </label>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Cargos en cuenta
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.slice(0, 3).map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => addCargo(p)}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
              >
                + {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={addSalidaInterior}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
            >
              + Salida interior
            </button>
            <button
              type="button"
              onClick={() => addCargo()}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              + Otro
            </button>
          </div>
        </div>

        {cargosVivos.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            Sin cargos extras. Agregá mantenimiento, salida al interior, multa, etc.
          </p>
        ) : (
          <ul className="space-y-2">
            {cargos.map((c) =>
              c.borrar ? null : (
                <li
                  key={c.key}
                  className="rounded-xl bg-surface-2/60 p-3 ring-1 ring-line"
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {c.concepto_codigo === CODIGO_SALIDA ? (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] text-muted">Destino (salida interior)</span>
                        <select
                          className={SELECT}
                          value={destinoIdDesdeConcepto(c.concepto)}
                          onChange={(e) => setDestinoSalida(c.key, e.target.value)}
                        >
                          {TARIFAS_SALIDA_INTERIOR.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre} (${d.monto})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] text-muted">Concepto</span>
                        <input
                          className={INPUT}
                          value={c.concepto}
                          onChange={(e) =>
                            setCargos((prev) =>
                              prev.map((x) =>
                                x.key === c.key ? { ...x, concepto: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Monto</span>
                      <input
                        type="number"
                        step="0.01"
                        className={INPUT}
                        value={c.monto}
                        onChange={(e) =>
                          setCargos((prev) =>
                            prev.map((x) =>
                              x.key === c.key
                                ? { ...x, monto: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Fecha</span>
                      <input
                        type="date"
                        className={INPUT}
                        value={c.fecha}
                        onChange={(e) =>
                          setCargos((prev) =>
                            prev.map((x) =>
                              x.key === c.key ? { ...x, fecha: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    {c.concepto_codigo !== CODIGO_SALIDA && (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] text-muted">Tipo</span>
                        <select
                          className={INPUT}
                          value={c.tipo}
                          onChange={(e) =>
                            setCargos((prev) =>
                              prev.map((x) =>
                                x.key === c.key ? { ...x, tipo: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {TIPOS_CARGO.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {c.concepto_codigo === CODIGO_SALIDA && (
                      <p className="col-span-2 text-[11px] text-muted sm:col-span-4">
                        Tarifa de permiso para salir al interior. Se suma a lo debido del día.
                      </p>
                    )}
                    <div className="flex items-end sm:col-span-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCargos((prev) =>
                            prev.map((x) =>
                              x.key === c.key ? { ...x, borrar: true } : x,
                            ),
                          )
                        }
                        className="rounded-lg px-3 py-2 text-sm text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Acuerdos de pago
          </h3>
          <button
            type="button"
            onClick={addAcuerdo}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            + Acuerdo
          </button>
        </div>
        {acuerdosVivos.length === 0 ? (
          <p className="py-3 text-sm text-muted">Sin acuerdos activos.</p>
        ) : (
          <ul className="space-y-2">
            {acuerdos.map((a) =>
              a.borrar ? null : (
                <li key={a.key} className="rounded-xl bg-surface-2/60 p-3 ring-1 ring-line">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[11px] text-muted">Descripción</span>
                      <input
                        className={INPUT}
                        value={a.descripcion}
                        onChange={(e) =>
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key ? { ...x, descripcion: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Saldo</span>
                      <input
                        type="number"
                        step="0.01"
                        className={INPUT}
                        value={a.saldo}
                        onChange={(e) =>
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key
                                ? { ...x, saldo: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">
                        {labelCuota(a.frecuencia ?? "dia")}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        className={INPUT}
                        value={a.cuota_diaria}
                        onChange={(e) =>
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key
                                ? { ...x, cuota_diaria: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Cada</span>
                      <select
                        className={SELECT}
                        value={a.frecuencia ?? "dia"}
                        onChange={(e) => {
                          const frecuencia = e.target.value as FrecuenciaAcuerdo;
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key
                                ? {
                                    ...x,
                                    frecuencia,
                                    fecha_especifica:
                                      frecuencia === "dia"
                                        ? null
                                        : x.fecha_especifica ?? hoyPanama(),
                                  }
                                : x,
                            ),
                          );
                        }}
                      >
                        {FRECUENCIAS_ACUERDO.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(a.frecuencia ?? "dia") !== "dia" && (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] text-muted">
                          {(a.frecuencia ?? "dia") === "fecha"
                            ? "Fecha de cobro"
                            : "Fecha ancla"}
                        </span>
                        <input
                          type="date"
                          className={INPUT}
                          value={a.fecha_especifica ?? ""}
                          onChange={(e) =>
                            setAcuerdos((prev) =>
                              prev.map((x) =>
                                x.key === a.key
                                  ? {
                                      ...x,
                                      fecha_especifica: e.target.value || null,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                    {hintFrecuencia(a.frecuencia ?? "dia") && (
                      <p className="col-span-2 text-[11px] text-muted sm:col-span-4">
                        {hintFrecuencia(a.frecuencia ?? "dia")}
                      </p>
                    )}
                    <label className="flex items-center gap-2 pt-5 text-sm">
                      <input
                        type="checkbox"
                        checked={a.activo}
                        onChange={(e) =>
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key ? { ...x, activo: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Activo
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() =>
                          setAcuerdos((prev) =>
                            prev.map((x) =>
                              x.key === a.key ? { ...x, borrar: true } : x,
                            ),
                          )
                        }
                        className="rounded-lg px-3 py-2 text-sm text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          disabled={saving}
          className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          Guardar cambios
        </button>
      </div>

      {confirmar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar confirmación"
            onClick={() => !saving && setConfirmar(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-ledger-title"
            className="relative z-10 w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl ring-1 ring-line"
          >
            <h4 id="confirm-ledger-title" className="text-base font-semibold tracking-tight">
              ¿Guardar estos cambios?
            </h4>
            <p className="mt-2 text-sm text-muted">
              Se actualizará de inmediato la base de datos (cargos, acuerdos y letra). Revisá que
              no sea un error antes de confirmar.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmar(false)}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
              >
                No, volver
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmarYGuardar()}
                className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Sí, guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
