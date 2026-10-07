"use client";

import { useActionState, useState, useTransition } from "react";
import {
  loteAplicarSugeridos,
  loteIgnorarSeleccionados,
  resolverMovimientoExtracto,
} from "./actions";
import { StatusChip, Money, EmptyState, FiltersBar } from "@/components/kit";
import { numeroCarroOperativo } from "@/lib/cartera/cruce";
import { etiquetaCarroUi, siglaEmpresa } from "@/lib/cartera/empresa";
import type { ResultadoRevision } from "@/lib/cartera/revision-extracto";

export type CandidatoPago = {
  id: string;
  monto: number;
  numeroCarro: string | null;
  pagadoAt: string;
  referencia: string | null;
  empresa?: string | null;
};

export type MovimientoRevision = {
  id: string;
  fecha: string | null;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  numeroCarro: string | null;
  nombreDetectado: string | null;
  motivo: string | null;
  via: string | null;
  sugeridoCarro: string | null;
  sugeridoCliente: string | null;
  empresa: string | null;
  contratoId?: string | null;
  salidaHint?: string | null;
  candidatos?: CandidatoPago[];
};

function viaChip(via: string | null, ambiguo: boolean): { tone: "good" | "warn" | "crit" | "neutral" | "azul"; label: string } {
  if (ambiguo) return { tone: "crit", label: "ambiguo" };
  if (via === "carro") return { tone: "azul", label: "por carro" };
  if (via === "nombre") return { tone: "warn", label: "por nombre" };
  return { tone: "neutral", label: "sin pista" };
}

function parseIdsMotivo(motivo: string | null): string[] {
  if (!motivo) return [];
  const m = /\[ids:([^\]]+)\]/.exec(motivo);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

const ORDEN_EMPRESA = ["AL", "KW", "GD"];

export function ColaRevision({ movimientos }: { movimientos: MovimientoRevision[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [empresa, setEmpresa] = useState("all");
  const [loteMsg, setLoteMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (movimientos.length === 0) {
    return (
      <EmptyState
        title="Nada por revisar"
        hint="Al subir un extracto, lo que no calce perfecto aparece aquí."
      />
    );
  }

  const conteo = new Map<string, number>();
  for (const m of movimientos) {
    const sigla = siglaEmpresa(m.empresa) || "Sin empresa";
    conteo.set(sigla, (conteo.get(sigla) ?? 0) + 1);
  }
  const siglas = [...conteo.keys()].sort((a, b) => {
    const ia = ORDEN_EMPRESA.indexOf(a);
    const ib = ORDEN_EMPRESA.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const visibles =
    empresa === "all" ? movimientos : movimientos.filter((m) => (siglaEmpresa(m.empresa) || "Sin empresa") === empresa);

  const sugeridos = visibles.filter((m) => m.via === "carro" && (m.sugeridoCarro || m.numeroCarro) && !(m.candidatos && m.candidatos.length > 1));
  const seleccionados = visibles.filter((m) => selected[m.id]).map((m) => m.id);

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function aplicarLote() {
    start(async () => {
      const fd = new FormData();
      for (const m of sugeridos) fd.append("movimiento_id", m.id);
      const r = await loteAplicarSugeridos(fd);
      setLoteMsg(r.msg);
    });
  }

  function ignorarLote() {
    start(async () => {
      const fd = new FormData();
      for (const id of seleccionados) fd.append("movimiento_id", id);
      const r = await loteIgnorarSeleccionados(fd);
      setLoteMsg(r.msg);
      setSelected({});
    });
  }

  return (
    <div className="space-y-3">
      <FiltersBar
        chips={[
          { id: "all", label: "Todas", count: movimientos.length },
          ...siglas.map((s) => ({ id: s, label: s, count: conteo.get(s) ?? 0 })),
        ]}
        activeChip={empresa}
        onChip={setEmpresa}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
        <button
          type="button"
          disabled={pending || sugeridos.length === 0}
          onClick={aplicarLote}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "…" : `Aplicar sugeridos (${sugeridos.length})`}
        </button>
        <button
          type="button"
          disabled={pending || seleccionados.length === 0}
          onClick={ignorarLote}
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash disabled:opacity-50"
        >
          Ignorar seleccionados ({seleccionados.length})
        </button>
        <p className="text-xs text-muted">
          El número es de la empresa del extracto. Aplicar en lote solo toca la empresa que estás viendo.
        </p>
      </div>
      {loteMsg && <p className="text-sm text-muted">{loteMsg}</p>}

      {visibles.length === 0 && (
        <EmptyState
          title="Nada de esta empresa"
          hint="Cambiá el filtro para ver los movimientos de otra flota."
        />
      )}

      {visibles.map((m) => (
        <FilaRevision
          key={m.id}
          m={m}
          checked={Boolean(selected[m.id])}
          onToggle={() => toggle(m.id)}
        />
      ))}
    </div>
  );
}

function FilaRevision({
  m,
  checked,
  onToggle,
}: {
  m: MovimientoRevision;
  checked: boolean;
  onToggle: () => void;
}) {
  const [aplicar, accionAplicar, aplicando] = useActionState<ResultadoRevision | null, FormData>(
    resolverMovimientoExtracto,
    null,
  );
  const [ignorar, accionIgnorar, ignorando] = useActionState<ResultadoRevision | null, FormData>(
    resolverMovimientoExtracto,
    null,
  );
  const [carro, setCarro] = useState(numeroCarroOperativo(m.sugeridoCarro ?? m.numeroCarro) ?? "");
  const idsMotivo = parseIdsMotivo(m.motivo);
  const candidatos =
    m.candidatos && m.candidatos.length > 0
      ? m.candidatos
      : idsMotivo.map((id) => ({
          id,
          monto: m.monto,
          numeroCarro: null as string | null,
          pagadoAt: "",
          referencia: null as string | null,
          empresa: m.empresa,
        }));
  const ambiguo = candidatos.length > 1 || (m.motivo?.includes("Varios comprobantes") ?? false);
  const [pagoId, setPagoId] = useState(candidatos[0]?.id ?? "");
  const via = viaChip(m.via, ambiguo);
  const busy = aplicando || ignorando;
  const sigla = siglaEmpresa(m.empresa);

  if (aplicar?.ok || ignorar?.ok) return null;

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-1.5 h-4 w-4 rounded border-line"
            aria-label="Seleccionar para ignorar en lote"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-lg font-semibold">
                <Money amount={m.monto} />
              </span>
              {m.empresa && <StatusChip tone="neutral">{siglaEmpresa(m.empresa)}</StatusChip>}
              <StatusChip tone={via.tone}>{via.label}</StatusChip>
              {m.sugeridoCarro && (
                <StatusChip tone="azul">{etiquetaCarroUi(m.empresa, m.sugeridoCarro)}</StatusChip>
              )}
              {m.referencia && (
                <StatusChip tone="neutral">Ref {m.referencia}</StatusChip>
              )}
              {m.salidaHint && <StatusChip tone="warn">salida interior</StatusChip>}
            </div>
            <p className="mt-2 text-sm text-muted">
              {m.fecha ?? "sin fecha"}
              {m.nombreDetectado ? ` · ${m.nombreDetectado}` : ""}
            </p>
            {m.descripcion && (
              <p className="mt-1 text-sm">{m.descripcion.slice(0, 140)}</p>
            )}
            {m.motivo && (
              <p className={`mt-2 text-[12px] ${m.motivo.includes("Aviso:") ? "text-ambar" : "text-muted"}`}>
                {m.motivo.replace(/\s*\[ids:[^\]]+\]/, "")}
              </p>
            )}
            {m.salidaHint && <p className="mt-1 text-[12px] text-ambar">{m.salidaHint}</p>}
            {m.sugeridoCliente && (
              <p className="mt-1 text-[12px] text-muted">Sugerido: {m.sugeridoCliente}</p>
            )}
          </div>
        </div>
      </div>

      {(aplicar?.error || ignorar?.error) && (
        <p className="mt-3 text-sm text-rojo">{aplicar?.error ?? ignorar?.error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <form action={accionAplicar} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="movimiento_id" value={m.id} />
          <input type="hidden" name="accion" value="aplicar" />
          {candidatos.length === 1 && !ambiguo && (
            <input type="hidden" name="pago_id" value={candidatos[0].id} />
          )}
          {ambiguo && candidatos.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Comprobante
              </span>
              <select
                name="pago_id"
                value={pagoId}
                onChange={(e) => {
                  setPagoId(e.target.value);
                  const c = candidatos.find((x) => x.id === e.target.value);
                  const op = numeroCarroOperativo(c?.numeroCarro);
                  if (op) setCarro(op);
                }}
                required
                className="min-w-[14rem] rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-line"
              >
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {etiquetaCarroUi(c.empresa ?? m.empresa, c.numeroCarro) === "—"
                      ? "Sin carro"
                      : etiquetaCarroUi(c.empresa ?? m.empresa, c.numeroCarro)}{" "}
                    · {c.referencia ? `ref ${c.referencia}` : c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Carro{sigla ? ` · ${sigla}` : ""}
            </span>
            <span className="flex overflow-hidden rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-ink/20">
              {sigla && (
                <span className="flex items-center bg-surface-2 px-2.5 text-sm font-medium text-ink">
                  {sigla}
                </span>
              )}
              <input
                name="carro"
                value={carro}
                onChange={(e) => setCarro(e.target.value)}
                placeholder={sigla === "GD" ? "G25" : "25"}
                required
                className="w-24 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-faint"
              />
            </span>
          </label>
          <button
            disabled={busy}
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {aplicando ? "Aplicando…" : "Aplicar"}
          </button>
        </form>
        <form action={accionIgnorar}>
          <input type="hidden" name="movimiento_id" value={m.id} />
          <input type="hidden" name="accion" value="ignorar" />
          <button
            disabled={busy}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 transition hover:bg-rojo-wash disabled:opacity-50"
          >
            {ignorando ? "…" : "Ignorar"}
          </button>
        </form>
      </div>
    </div>
  );
}
