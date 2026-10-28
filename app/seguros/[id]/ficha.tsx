"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { StatusChip, Toast } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import {
  ASEGURADORAS,
  DOCUMENTOS,
  SECCIONES,
  TELEFONO_TRANSITO,
  atraso,
  cerrado,
  diasEnSeccion,
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
import {
  carroVolvio,
  confirmarChoque,
  eliminarCaso,
  guardarCaso,
  marcarAviso,
  quitarDocumento,
  subirDocCliente,
  subirDocumento,
} from "../actions";
import { BloqueRegistro } from "../registro";
import {
  pathCliente,
  registroTieneDatos,
  type ClienteDelCaso,
  type DocCliente,
  type RegistroCarro,
} from "@/lib/seguros/datos";
import { totalPapeles } from "@/lib/seguros/portada";
import { plata, tarifasDe, totalTarifa } from "@/lib/seguros/tarifas";

const INPUT =
  "w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20";
const PRIMARIO =
  "rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50";
const SECUNDARIO =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50";
const PELIGRO =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 hover:bg-surface-2 disabled:opacity-50";

export function FichaCaso({
  fila,
  urls,
  hoy,
  registro,
  cliente,
  faltan,
}: {
  fila: CasoFila;
  urls: Record<string, string>;
  hoy: string;
  registro: RegistroCarro | null;
  cliente: ClienteDelCaso | null;
  faltan: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorDoc, setErrorDoc] = useState<{ tipo: DocTipo; msg: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>(fila.caso.seccion);
  const [via, setVia] = useState<"" | "fud" | "parte">(fila.caso.via ?? "");
  const [aseguradora, setAseguradora] = useState(fila.caso.aseguradora);
  const [piezas, setPiezas] = useState<Pieza[]>(fila.caso.piezas);
  const tarifas = tarifasDe(fila.marca, fila.modelo, fila.anio);
  const casoVista = { ...fila.caso, seccion, via: via === "fud" || via === "parte" ? via : null, aseguradora };
  const proxima = siguienteSeccion(casoVista);
  const total = totalPapeles(fila.caso.via);
  const porConfirmar = fila.caso.porConfirmar;
  const dias = diasEnSeccion(fila, hoy);
  const trabado = atraso(fila, hoy);
  const conductorCliente = !fila.caso.conductor.trim() && cliente ? cliente : null;

  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const alNavegar = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.dataset.guardaAntes) return;
      if (!window.confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", alSalir);
    document.addEventListener("click", alNavegar, true);
    return () => {
      window.removeEventListener("beforeunload", alSalir);
      document.removeEventListener("click", alNavegar, true);
    };
  }, [sucio]);

  function guardar(e: FormEvent<HTMLFormElement>, destino?: Seccion, luego?: () => void) {
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
      setSucio(false);
      if (destino) setSeccion(destino);
      setAviso(destino ? `Pasó a ${etiquetaSeccion(destino)}.` : "Guardado.");
      if (luego) luego();
      else router.refresh();
    });
  }

  function correr(
    accion: (fd: FormData) => Promise<{ ok: boolean; error?: string; msg?: string }>,
    fd: FormData,
    tipo?: DocTipo,
  ) {
    setError(null);
    setErrorDoc(null);
    start(async () => {
      const r = await accion(fd).catch(() => ({ ok: false, error: "No se pudo completar.", msg: undefined }));
      if (!r.ok) {
        const msg = r.error ?? "No se pudo completar.";
        if (tipo) setErrorDoc({ tipo, msg });
        else setError(msg);
        return;
      }
      if (r.msg) setAviso(r.msg);
      router.refresh();
    });
  }

  /** Uno por uno: cada subida reescribe la lista de documentos del caso. */
  function subirArchivos(tipo: DocTipo, archivos: File[]) {
    if (archivos.length === 0) return;
    setErrorDoc(null);
    start(async () => {
      for (const archivo of archivos) {
        const fd = new FormData();
        fd.set("id", fila.id);
        fd.set("tipo", tipo);
        fd.set("archivo", archivo);
        if (archivo.size > 8 * 1024 * 1024) {
          setErrorDoc({ tipo, msg: `${archivo.name}: el archivo pasa de 8 MB.` });
          break;
        }
        const r = await subirDocumento(fd).catch(() => ({ ok: false, error: "No se pudo subir." }));
        if (!r.ok) {
          setErrorDoc({ tipo, msg: `${archivo.name}: ${r.error ?? "No se pudo subir."}` });
          break;
        }
      }
      router.refresh();
    });
  }

  const tel = telefonoAseguradora(aseguradora);

  function enviar(destino?: Seccion, luego?: () => void) {
    const form = document.getElementById("caso") as HTMLFormElement | null;
    if (!form) return;
    guardar({ preventDefault() {}, currentTarget: form } as FormEvent<HTMLFormElement>, destino, luego);
  }

  function moverA(destino: Seccion) {
    if (destino === seccion) return;
    const extra = sucio ? " También se guardan los cambios que hizo." : "";
    if (!window.confirm(`¿Pasar el caso a ${etiquetaSeccion(destino)}?${extra}`)) return;
    enviar(destino);
  }

  /** Abre el bloque del reclamo y lleva el cursor al campo si está vacío. */
  function pedirCampo(nombre: string, msg: string): boolean {
    const campo = document.querySelector<HTMLInputElement>(`#caso [name="${nombre}"]`);
    if (campo?.value.trim()) return true;
    document.getElementById("bloque-reclamo")?.setAttribute("open", "");
    campo?.focus();
    setError(msg);
    return false;
  }

  function borrarCaso(pregunta: string) {
    if (!window.confirm(pregunta)) return;
    const fd = new FormData();
    fd.set("id", fila.id);
    setError(null);
    start(async () => {
      const r = await eliminarCaso(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo eliminar.");
        return;
      }
      setSucio(false);
      router.push("/seguros");
      router.refresh();
    });
  }

  const paquete = `/seguros/${fila.id}/paquete`;

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
          <Link
            href={paquete}
            data-guarda-antes="1"
            className={SECUNDARIO}
            onClick={(e) => {
              if (!sucio) return;
              e.preventDefault();
              if (window.confirm("Hay cambios sin guardar. ¿Guardarlos y abrir el paquete?")) {
                enviar(undefined, () => router.push(paquete));
              }
            }}
          >
            Paquete del reclamo
          </Link>
        </div>
      </header>

      {porConfirmar && (
        <section className="rounded-xl bg-ambar-wash p-5 ring-1 ring-ambar/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ambar">Reportado por WhatsApp</p>
          <p className="mt-2 max-w-2xl text-sm">
            El cliente avisó un choque en el chat de cartera. El carro sigue trabajando y el cobro no cambia hasta que lo
            confirme.
          </p>
          {fila.caso.relato && <p className="mt-3 max-w-2xl rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line">“{fila.caso.relato}”</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={PRIMARIO}
              disabled={pending}
              onClick={() => {
                if (!window.confirm("¿Confirmar el choque? El carro queda en colisión desde la fecha del choque.")) return;
                const fd = new FormData();
                fd.set("id", fila.id);
                correr(confirmarChoque, fd);
              }}
            >
              Confirmar choque
            </button>
            <button
              type="button"
              className={SECUNDARIO}
              disabled={pending}
              onClick={() => borrarCaso("¿Descartar este reporte? Se borra el caso y el carro sigue igual.")}
            >
              Descartar
            </button>
            {fila.caso.conversacionId && (
              <Link
                href={`/cartera/conversaciones/${fila.caso.conversacionId}`}
                className="ml-auto text-sm font-medium hover:underline"
              >
                Ver el chat
              </Link>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
        </section>
      )}

      {!porConfirmar && (
      <div className="flex flex-wrap gap-1.5">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={pending}
            onClick={() => moverA(s.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              seccion === s.id ? "bg-ink font-medium text-white" : "bg-surface text-muted ring-1 ring-line hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      )}

      <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Qué sigue</p>
        <p className="mt-2 max-w-2xl text-base">{queSigue(casoVista)}</p>
        {!cerrado(fila.caso.seccion) && (
          <p className={`mt-2 text-sm ${trabado ? "font-medium text-rojo" : "text-muted"}`}>
            {trabado ?? `Lleva ${dias === 0 ? "desde hoy" : dias === 1 ? "1 día" : `${dias} días`} en esta etapa.`}
          </p>
        )}
        {seccion === "reportado" && (
          <p className="mt-3 text-sm text-muted">
            Tránsito {TELEFONO_TRANSITO}
            {tel ? ` · ${nombreAseguradora(aseguradora)} ${tel}` : ""}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {proxima && !porConfirmar && (
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
        {seccion !== "no_procede" && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Papeles del paquete</p>
              <p className="text-xs tabular-nums text-muted">
                {total - faltan.length} de {total}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${faltan.length ? "bg-ambar" : "bg-verde"}`}
                style={{ width: `${Math.round(((total - faltan.length) / total) * 100)}%` }}
              />
            </div>
            {faltan.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {faltan.map((f) => (
                  <li key={f} className="rounded-md bg-ambar-wash px-2 py-1 text-xs text-ambar ring-1 ring-ambar/20">
                    Falta: {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-verde">El paquete tiene todos los papeles.</p>
            )}
          </div>
        )}
      </section>

      <form id="caso" onSubmit={(e) => guardar(e)} onChange={() => setSucio(true)} className="flex flex-col gap-6">
        <input type="hidden" name="seccion" value={seccion} />
        <Bloque
          titulo="Del choque"
          abierto={abre(seccion, ["reportado", "cita"])}
          resumen={[fechaCorta(fila.fecha), via === "parte" ? "Parte policivo" : via === "fud" ? "FUD" : "", nombreAseguradora(aseguradora)]
            .filter(Boolean)
            .join(" · ")}
        >
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
              <button
                type="button"
                onClick={() => {
                  setVia("fud");
                  setSucio(true);
                }}
                className={via === "fud" ? PRIMARIO : SECUNDARIO}
              >
                FUD
              </button>
              <button
                type="button"
                onClick={() => {
                  setVia("parte");
                  setSucio(true);
                }}
                className={via === "parte" ? PRIMARIO : SECUNDARIO}
              >
                Parte policivo
              </button>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Aseguradora</span>
            <select value={aseguradora} onChange={(e) => setAseguradora(e.target.value as typeof aseguradora)} className={INPUT}>
              <option value="">Elija…</option>
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
        </Bloque>

        {via === "parte" && (
          <Bloque
            titulo="Audiencia"
            abierto={abre(seccion, ["audiencia", "resolucion"])}
            resumen={fila.caso.fechaAudiencia ? `Audiencia ${fechaCorta(fila.caso.fechaAudiencia)}` : "Sin fecha"}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha</span>
              <input name="fecha_audiencia" type="date" defaultValue={fila.caso.fechaAudiencia} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Segunda audiencia</span>
              <input name="fecha_audiencia_2" type="date" defaultValue={fila.caso.fechaAudiencia2} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Lugar</span>
              <input name="lugar_audiencia" defaultValue={fila.caso.lugarAudiencia} placeholder="Juzgado de tránsito" className={INPUT} />
            </label>
          </Bloque>
        )}

        <Bloque
          titulo="Portada del paquete"
          abierto={abre(seccion, ["facturas", "seguimiento"])}
          resumen={fila.caso.conductor || conductorCliente?.nombre || ""}
        >
          <p className="text-xs text-muted sm:col-span-2">
            Estos datos salen en la hoja amarilla que encabeza el paquete del reclamo.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Conductor</span>
            <input name="conductor" defaultValue={fila.caso.conductor || conductorCliente?.nombre || ""} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Cédula del conductor</span>
            <input
              name="cedula_conductor"
              defaultValue={fila.caso.cedulaConductor || conductorCliente?.cedula || ""}
              className={INPUT}
            />
          </label>
          {conductorCliente && (
            <p className="-mt-2 text-xs text-muted sm:col-span-2">
              Tomado del cliente del carro. Si manejaba otra persona, cámbielo.
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Placa de cupo</span>
            <input name="placa_cupo" defaultValue={fila.caso.placaCupo} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Asistencia de colisión</span>
            <input name="asistencia" defaultValue={fila.caso.asistencia} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Ajustador</span>
            <input name="ajustador" defaultValue={fila.caso.ajustador} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Número de trámite</span>
            <input name="numero_tramite" defaultValue={fila.caso.numeroTramite} placeholder="Si queda vacío, la portada usa el reclamo" className={INPUT} />
          </label>
        </Bloque>

        <Bloque
          titulo="Piezas y precios"
          abierto={abre(seccion, ["facturas"])}
          resumen={piezas.length ? `${piezas.length} ${piezas.length === 1 ? "pieza" : "piezas"} · USD ${plata(totalPiezas(piezas))}` : "Sin piezas"}
          grid={false}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">
                Al elegir la pieza se carga el precio con descuento y se le suma la mano de obra. En Kia Soluto esa mano de obra es la de Hyundai. Si el jefe pidió una pieza que no salió golpeada, márquela como extra.
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums">Total USD {plata(totalPiezas(piezas))}</p>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {piezas.map((p, i) => {
              const delListado = tarifas.some((t) => t.nombre === p.pieza);
              return (
                <div key={p.id} className="flex flex-col gap-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_auto_auto] sm:items-center">
                    <input type="hidden" name="pieza_id" value={p.id} />
                    <input type="hidden" name="precio_pieza" value={p.precioPieza ?? ""} />
                    <input type="hidden" name="mano_obra" value={p.manoObra ?? ""} />
                    <input
                      name="pieza"
                      value={p.pieza}
                      list={`tarifas-${p.id}`}
                      onChange={(e) => {
                        const nombre = e.target.value;
                        const t = tarifas.find((x) => x.nombre === nombre);
                        setPiezas(
                          piezas.map((x, j) => {
                            if (j !== i) return x;
                            if (!t) return { ...x, pieza: nombre, precioPieza: undefined, manoObra: undefined };
                            return { ...x, pieza: nombre, precioPieza: t.pieza, manoObra: t.mano, precio: totalTarifa(t) };
                          }),
                        );
                      }}
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
                          piezas.map((x, j) =>
                            j === i
                              ? { ...x, precio: Number(e.target.value.replace(",", ".")) || 0, precioPieza: undefined, manoObra: undefined }
                              : x,
                          ),
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
                      onClick={() => {
                        setPiezas(piezas.filter((_, j) => j !== i));
                        setSucio(true);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                  <datalist id={`tarifas-${p.id}`}>
                    {tarifas.map((t) => (
                      <option key={t.nombre} value={t.nombre} />
                    ))}
                  </datalist>
                  {delListado && typeof p.precioPieza === "number" && typeof p.manoObra === "number" && (
                    <p className="text-xs text-muted tabular-nums">
                      Pieza con descuento USD {plata(p.precioPieza)} · mano de obra USD {plata(p.manoObra)}
                      {p.manoObra === 0 && (
                        <span className="text-ambar"> · El listado no trae mano de obra para esta pieza. Si lleva, ajuste el monto.</span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className={`${SECUNDARIO} mt-3`}
            onClick={() => {
              setPiezas([...piezas, { id: crypto.randomUUID(), pieza: "", condicion: "reparar", precio: 0, extra: false }]);
              setSucio(true);
            }}
          >
            Agregar pieza
          </button>
          {via === "parte" && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="acuerdo_firmado" value="1" defaultChecked={fila.caso.acuerdoFirmado} />
              El cliente firmó el acuerdo de pago
            </label>
          )}
        </Bloque>

        <Bloque
          id="bloque-reclamo"
          titulo="Reclamo"
          abierto={abre(seccion, ["seguimiento", "pagado", "no_procede"])}
          resumen={[
            fila.caso.numeroReclamo,
            fila.caso.montoFiniquito != null ? `Finiquito USD ${plata(fila.caso.montoFiniquito)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
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
        </Bloque>

        <div
          className={`sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl p-3 shadow-sm ring-1 ${
            error ? "bg-rojo-wash ring-rojo/30" : sucio ? "bg-white ring-ink/20" : "bg-white ring-line"
          }`}
        >
          <p className={`mr-auto text-sm ${error ? "text-rojo" : sucio ? "font-medium text-ink" : "text-muted"}`}>
            {error ?? (sucio ? "Hay cambios sin guardar." : "Todo guardado.")}
          </p>
          <button type="submit" className={PRIMARIO} disabled={pending || (!sucio && !error)}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {seccion !== "pagado" && (
            <button
              type="button"
              className={SECUNDARIO}
              disabled={pending}
              onClick={() => {
                if (!pedirCampo("monto_finiquito", "Anote el monto del finiquito para marcarlo pagado.")) return;
                if (window.confirm("¿Marcar el caso como pagado?")) enviar("pagado");
              }}
            >
              Marcar pagado
            </button>
          )}
          {seccion !== "no_procede" && (
            <button
              type="button"
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                if (!pedirCampo("motivo_no_procede", "Anote por qué no procede para cerrar el caso.")) return;
                if (window.confirm("¿Cerrar el caso como no procede?")) enviar("no_procede");
              }}
            >
              No procede
            </button>
          )}
        </div>
      </form>

      <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <h2 className="text-sm font-semibold">Documentos del paquete</h2>
        <p className="mt-1 text-xs text-muted">
          Cada caja es un papel del paquete. Puede subir varios archivos en la misma. Los archivos se guardan solos al subirlos.
        </p>
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
              error={errorDoc?.tipo === d.id ? errorDoc.msg : null}
              onRun={(accion, fd) => correr(accion, fd, d.id)}
              onSubir={(archivos) => subirArchivos(d.id, archivos)}
              registro={d.id === "registro" ? registro : null}
              cliente={d.id === "cedula" || d.id === "licencia" ? cliente : null}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
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
        <button
          type="button"
          className={`${PELIGRO} ml-auto`}
          disabled={pending}
          onClick={() =>
            borrarCaso(
              "¿Eliminar este choque? Se borra el caso y sus archivos. Si el carro quedó en colisión por este registro y no tiene otro choque, vuelve a trabajar.",
            )
          }
        >
          Eliminar choque
        </button>
      </div>

      <p className="text-xs text-muted">Hoy es {fechaCorta(hoy)}. Publique el resumen también en el grupo de colisiones.</p>
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
    </div>
  );
}

function abre(seccion: Seccion, en: Seccion[]): boolean {
  return en.includes(seccion);
}

/** Los campos plegados siguen dentro del form: se guardan igual. */
function Bloque({
  id,
  titulo,
  abierto,
  resumen,
  grid = true,
  children,
}: {
  id?: string;
  titulo: string;
  abierto: boolean;
  resumen?: string;
  grid?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} open={abierto} className="group rounded-xl bg-surface ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="flex min-w-0 items-center gap-3 text-xs text-muted">
          {resumen ? <span className="truncate group-open:hidden">{resumen}</span> : null}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className={grid ? "grid gap-4 px-5 pb-5 sm:grid-cols-2" : "px-5 pb-5"}>{children}</div>
    </details>
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
  error,
  onRun,
  onSubir,
  registro,
  cliente,
}: {
  casoId: string;
  tipo: DocTipo;
  label: string;
  hint: string;
  archivos: { id: string; nombre: string; path: string }[];
  urls: Record<string, string>;
  disabled: boolean;
  error: string | null;
  onRun: (accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) => void;
  onSubir: (archivos: File[]) => void;
  registro?: RegistroCarro | null;
  cliente?: ClienteDelCaso | null;
}) {
  const traido = registroTieneDatos(registro);
  const campo = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const esFoto = tipo === "foto_dano" || tipo === "foto_reparado";
  const delCliente = cliente && (tipo === "cedula" || tipo === "licencia") ? (tipo as DocCliente) : null;
  return (
    <div className={`rounded-lg p-3 ring-1 ${error ? "ring-rojo/40" : "ring-line"}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{delCliente ? "Ya la tenemos del cliente. Va sola en el paquete." : hint}</p>
      {traido && registro && (
        <div className="mt-3">
          <BloqueRegistro registro={registro} />
        </div>
      )}
      {delCliente && cliente && (
        <CopiaCliente casoId={casoId} cliente={cliente} cual={delCliente} urls={urls} disabled={disabled} onRun={onRun} />
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
      <input
        ref={campo}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const elegidos = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          onSubir(elegidos);
        }}
      />
      {delCliente ? (
        <button
          type="button"
          className="mt-3 text-xs text-muted hover:text-ink hover:underline"
          disabled={disabled}
          onClick={() => campo.current?.click()}
        >
          Manejaba otra persona: subir su copia solo para este caso
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          {esFoto && (
            <>
              <input
                ref={camara}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const elegidos = Array.from(e.currentTarget.files ?? []);
                  e.currentTarget.value = "";
                  onSubir(elegidos);
                }}
              />
              <button
                type="button"
                className={`${PRIMARIO} flex-1 sm:hidden`}
                disabled={disabled}
                onClick={() => camara.current?.click()}
              >
                Tomar foto
              </button>
            </>
          )}
          <button
            type="button"
            className={`${SECUNDARIO} flex-1`}
            disabled={disabled}
            onClick={() => campo.current?.click()}
          >
            {disabled ? "Subiendo…" : archivos.length > 0 ? "Agregar archivo" : "Subir archivo"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rojo">{error}</p>}
    </div>
  );
}

function CopiaCliente({
  casoId,
  cliente,
  cual,
  urls,
  disabled,
  onRun,
}: {
  casoId: string;
  cliente: ClienteDelCaso;
  cual: DocCliente;
  urls: Record<string, string>;
  disabled: boolean;
  onRun: (accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const copia = urls[pathCliente(cliente.id, cual)];
  const numero = cual === "cedula" ? cliente.cedula : cliente.licencia;
  return (
    <div className="mt-3 rounded-lg bg-surface-2 p-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">Cliente</dt>
          <dd className="mt-0.5">{cliente.nombre || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{cual === "cedula" ? "Cédula" : "Licencia"}</dt>
          <dd className="mt-0.5 tabular-nums">{numero.trim() || "—"}</dd>
        </div>
        {cual === "licencia" && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">Vence</dt>
            <dd className="mt-0.5 tabular-nums">{cliente.venceLicencia ? fechaCorta(cliente.venceLicencia) : "—"}</dd>
          </div>
        )}
      </dl>
      <input
        ref={campo}
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const archivo = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!archivo) return;
          const fd = new FormData();
          fd.set("id", casoId);
          fd.set("cliente_id", cliente.id);
          fd.set("cual", cual);
          fd.set("archivo", archivo);
          onRun(subirDocCliente, fd);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {copia ? (
          <a href={copia} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
            Ver copia
          </a>
        ) : (
          <span className="text-xs text-rojo">Falta la copia del documento.</span>
        )}
        <button
          type="button"
          className={`${SECUNDARIO} ml-auto`}
          disabled={disabled}
          onClick={() => campo.current?.click()}
        >
          {copia ? "Cambiar" : "Agregar copia"}
        </button>
      </div>
    </div>
  );
}
