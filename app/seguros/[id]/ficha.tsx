"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Money, StatusChip, Toast } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import {
  ASEGURADORAS,
  DOCUMENTOS,
  SECCIONES,
  TELEFONO_TRANSITO,
  etiquetaSeccion,
  fechaCorta,
  nombreAseguradora,
  queSigue,
  siguienteSeccion,
  telefonoAseguradora,
  tonoSeccion,
  totalPiezas,
  type CasoFila,
  type DocTipo,
  type Pieza,
  type Seccion,
} from "@/lib/seguros/modelo";
import { carroVolvio, guardarCaso, marcarAviso, quitarDocumento, subirDocumento } from "../actions";
import { BloqueRegistro } from "../registro";
import { registroTieneDatos, type RegistroCarro } from "@/lib/seguros/datos";

const INPUT =
  "w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20";
const PRIMARIO =
  "rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50";
const SECUNDARIO =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50";

export function FichaCaso({
  fila,
  urls,
  hoy,
  registro,
}: {
  fila: CasoFila;
  urls: Record<string, string>;
  hoy: string;
  registro: RegistroCarro | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<Seccion>(fila.caso.seccion);
  const [via, setVia] = useState<"" | "fud" | "parte">(fila.caso.via ?? "");
  const [aseguradora, setAseguradora] = useState(fila.caso.aseguradora);
  const [piezas, setPiezas] = useState<Pieza[]>(fila.caso.piezas);
  const casoVista = { ...fila.caso, seccion, via: via === "fud" || via === "parte" ? via : null, aseguradora };
  const proxima = siguienteSeccion(casoVista);

  function guardar(e: FormEvent<HTMLFormElement>, destino?: Seccion) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", fila.id);
    fd.set("seccion", destino ?? seccion);
    fd.set("via", via);
    fd.set("aseguradora", aseguradora);
    setError(null);
    start(async () => {
      const r = await guardarCaso(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar.");
        return;
      }
      if (destino) setSeccion(destino);
      setAviso(destino ? `Pasó a ${etiquetaSeccion(destino)}.` : "Guardado.");
      router.refresh();
    });
  }

  function correr(accion: (fd: FormData) => Promise<{ ok: boolean; error?: string; msg?: string }>, fd: FormData) {
    setError(null);
    start(async () => {
      const r = await accion(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo completar.");
        return;
      }
      if (r.msg) setAviso(r.msg);
      router.refresh();
    });
  }

  const tel = telefonoAseguradora(aseguradora);

  function enviar(destino?: Seccion) {
    const form = document.getElementById("caso") as HTMLFormElement | null;
    if (!form) return;
    guardar({ preventDefault() {}, currentTarget: form } as FormEvent<HTMLFormElement>, destino);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Seguros</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-[28px]">
            {etiquetaCarroUi(fila.empresa, fila.numero)}
            {fila.placa ? <span className="ml-2 font-mono text-lg font-medium text-muted">{fila.placa}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fila.caso.clienteNombre || "Sin cliente activo"} · choque {fechaCorta(fila.fecha)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={tonoSeccion(seccion)}>{etiquetaSeccion(seccion)}</StatusChip>
          <Link href={`/seguros/${fila.id}/paquete`} className={SECUNDARIO}>
            Imprimir paquete
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => enviar(s.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              seccion === s.id ? "bg-ink font-medium text-white" : "bg-surface text-muted ring-1 ring-line hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Qué sigue</p>
        <p className="mt-2 max-w-2xl text-base">{queSigue(casoVista)}</p>
        {seccion === "reportado" && (
          <p className="mt-3 text-sm text-muted">
            Tránsito {TELEFONO_TRANSITO}
            {tel ? ` · ${nombreAseguradora(aseguradora)} ${tel}` : ""}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {proxima && (
            <button type="button" onClick={() => enviar(proxima)} className={PRIMARIO} disabled={pending}>
              Pasar a {etiquetaSeccion(proxima)}
            </button>
          )}
          {(seccion === "cita" || seccion === "reportado") && fila.caso.avisoOficina !== fila.fecha && (
            <button
              type="button"
              className={SECUNDARIO}
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", fila.id);
                fd.set("cual", "oficina");
                correr(marcarAviso, fd);
              }}
            >
              Ya avisé la cita
            </button>
          )}
          {seccion === "audiencia" && fila.caso.fechaAudiencia && fila.caso.avisoAudiencia !== fila.caso.fechaAudiencia && (
            <button
              type="button"
              className={SECUNDARIO}
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", fila.id);
                fd.set("cual", "audiencia");
                correr(marcarAviso, fd);
              }}
            >
              Ya avisé la audiencia
            </button>
          )}
        </div>
      </section>

      <form id="caso" onSubmit={(e) => guardar(e)} className="flex flex-col gap-6">
        <input type="hidden" name="seccion" value={seccion} />
        <section className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
          <h2 className="text-sm font-semibold sm:col-span-2">Del choque</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha</span>
            <input name="fecha" type="date" required defaultValue={fila.fecha} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Kilometraje</span>
            <input name="km" inputMode="numeric" defaultValue={fila.km ?? ""} placeholder="180000" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Dónde fue</span>
            <input name="lugar" defaultValue={fila.caso.lugar} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Relato</span>
            <textarea name="relato" rows={3} defaultValue={fila.caso.relato} className={`${INPUT} resize-y`} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Camino</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setVia("fud")} className={via === "fud" ? PRIMARIO : SECUNDARIO}>
                FUD
              </button>
              <button type="button" onClick={() => setVia("parte")} className={via === "parte" ? PRIMARIO : SECUNDARIO}>
                Parte policivo
              </button>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Aseguradora</span>
            <select value={aseguradora} onChange={(e) => setAseguradora(e.target.value as typeof aseguradora)} className={INPUT}>
              <option value="">Elegí…</option>
              {ASEGURADORAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre} · {a.telefono}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Número de parte o FUD</span>
            <input name="numero_parte" defaultValue={fila.caso.numeroParte} className={INPUT} />
          </label>
        </section>

        {via === "parte" && (
          <section className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
            <h2 className="text-sm font-semibold sm:col-span-2">Audiencia</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha</span>
              <input name="fecha_audiencia" type="date" defaultValue={fila.caso.fechaAudiencia} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Lugar</span>
              <input name="lugar_audiencia" defaultValue={fila.caso.lugarAudiencia} placeholder="Juzgado de tránsito" className={INPUT} />
            </label>
          </section>
        )}

        <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Piezas y precios</h2>
              <p className="mt-1 text-xs text-muted">
                Nueva o a reparar. Si el jefe pidió sumar una pieza que no salió golpeada, marcala como extra.
              </p>
            </div>
            <p className="text-sm font-medium">
              Total <Money amount={totalPiezas(piezas)} />
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {piezas.map((p, i) => (
              <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_auto_auto] sm:items-center">
                <input type="hidden" name="pieza_id" value={p.id} />
                <input
                  name="pieza"
                  value={p.pieza}
                  onChange={(e) => setPiezas(piezas.map((x, j) => (j === i ? { ...x, pieza: e.target.value } : x)))}
                  placeholder="Defensa delantera"
                  className={INPUT}
                />
                <select
                  name="condicion"
                  value={p.condicion}
                  onChange={(e) =>
                    setPiezas(piezas.map((x, j) => (j === i ? { ...x, condicion: e.target.value === "reparar" ? "reparar" : "nueva" } : x)))
                  }
                  className={INPUT}
                >
                  <option value="nueva">Nueva</option>
                  <option value="reparar">Reparar</option>
                </select>
                <input
                  name="precio"
                  inputMode="decimal"
                  value={p.precio ? String(p.precio) : ""}
                  onChange={(e) =>
                    setPiezas(
                      piezas.map((x, j) => (j === i ? { ...x, precio: Number(e.target.value.replace(",", ".")) || 0 } : x)),
                    )
                  }
                  placeholder="0"
                  className={INPUT}
                />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    name="extra_idx"
                    value={String(i)}
                    checked={p.extra}
                    onChange={(e) => setPiezas(piezas.map((x, j) => (j === i ? { ...x, extra: e.target.checked } : x)))}
                  />
                  Extra
                </label>
                <button
                  type="button"
                  className="text-sm text-rojo"
                  onClick={() => setPiezas(piezas.filter((_, j) => j !== i))}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`${SECUNDARIO} mt-3`}
            onClick={() =>
              setPiezas([...piezas, { id: crypto.randomUUID(), pieza: "", condicion: "reparar", precio: 0, extra: false }])
            }
          >
            Agregar pieza
          </button>
          {via === "parte" && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="acuerdo_firmado" value="1" defaultChecked={fila.caso.acuerdoFirmado} />
              El cliente firmó el acuerdo de pago
            </label>
          )}
        </section>

        <section className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
          <h2 className="text-sm font-semibold sm:col-span-2">Reclamo</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Número de reclamo</span>
            <input name="numero_reclamo" defaultValue={fila.caso.numeroReclamo} placeholder="000-00-00000" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Monto del finiquito</span>
            <input name="monto_finiquito" inputMode="decimal" defaultValue={fila.caso.montoFiniquito ?? ""} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha en que pagaron</span>
            <input name="fecha_pago" type="date" defaultValue={fila.caso.fechaPago} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Si no procede, por qué</span>
            <input name="motivo_no_procede" defaultValue={fila.caso.motivoNoProcede} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Notas</span>
            <textarea name="observaciones" rows={2} defaultValue={fila.caso.observaciones} className={`${INPUT} resize-y`} />
          </label>
        </section>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARIO} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" className={SECUNDARIO} disabled={pending} onClick={() => enviar("pagado")}>
            Marcar pagado
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash disabled:opacity-50"
            disabled={pending}
            onClick={() => enviar("no_procede")}
          >
            No procede
          </button>
        </div>
      </form>

      <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <h2 className="text-sm font-semibold">Documentos del paquete</h2>
        <p className="mt-1 text-xs text-muted">Cada caja es un papel del paquete. Podés subir varios archivos en la misma.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DOCUMENTOS.map((d) => (
            <CajaDoc
              key={d.id}
              casoId={fila.id}
              tipo={d.id}
              label={d.label}
              hint={d.hint}
              archivos={fila.caso.documentos.filter((x) => x.tipo === d.id)}
              urls={urls}
              disabled={pending}
              onRun={correr}
              registro={d.id === "registro" ? registro : null}
            />
          ))}
        </div>
      </section>

      {fila.estadoCarro === "colision" && (
        <button
          type="button"
          className={SECUNDARIO}
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", fila.id);
            correr(carroVolvio, fd);
          }}
        >
          El carro volvió a trabajar
        </button>
      )}

      <p className="text-xs text-muted">Hoy es {fechaCorta(hoy)}. Publicá el resumen también en el grupo de colisiones.</p>
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
    </div>
  );
}

function CajaDoc({
  casoId,
  tipo,
  label,
  hint,
  archivos,
  urls,
  disabled,
  onRun,
  registro,
}: {
  casoId: string;
  tipo: DocTipo;
  label: string;
  hint: string;
  archivos: { id: string; nombre: string; path: string }[];
  urls: Record<string, string>;
  disabled: boolean;
  onRun: (accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) => void;
  registro?: RegistroCarro | null;
}) {
  const traido = registroTieneDatos(registro);
  return (
    <div className="rounded-lg p-3 ring-1 ring-line">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      {traido && registro && (
        <div className="mt-3">
          <BloqueRegistro registro={registro} />
        </div>
      )}
      <ul className="mt-2 flex flex-col gap-1">
        {archivos.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
            {urls[a.path] ? (
              <a href={urls[a.path]} target="_blank" rel="noreferrer" className="truncate hover:underline">
                {a.nombre}
              </a>
            ) : (
              <span className="truncate">{a.nombre}</span>
            )}
            <button
              type="button"
              className="shrink-0 text-rojo"
              disabled={disabled}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", casoId);
                fd.set("doc_id", a.id);
                onRun(quitarDocumento, fd);
              }}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("id", casoId);
          fd.set("tipo", tipo);
          onRun(subirDocumento, fd);
          e.currentTarget.reset();
        }}
      >
        <input name="archivo" type="file" accept="image/*,.pdf" className="block w-full text-xs text-muted" />
        <button type="submit" className="mt-2 text-sm font-medium hover:underline" disabled={disabled}>
          Subir
        </button>
      </form>
    </div>
  );
}
