"use server";

import { revalidatePath } from "next/cache";
import { aplicarEstadoProductivo, pausaDeVehiculo, reponerLetras } from "@/lib/cartera/pausa-productiva";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  borrarArchivo,
  borrarFila,
  borrarNotaColisionReportada,
  borrarPausaColision,
  carrosParaCaso,
  crearFila,
  dejarVehiculoActivo,
  listarCasos,
  empresaDeVehiculo,
  guardarFila,
  guardarPoliza,
  leerCaso,
  pathCliente,
  pathEmpresa,
  subirArchivo,
} from "@/lib/seguros/datos";
import {
  ASEGURADORAS,
  DOCUMENTOS,
  casoVacio,
  type AseguradoraId,
  type Caso,
  type DocTipo,
  type Pieza,
  type Seccion,
  SECCIONES,
} from "@/lib/seguros/modelo";

export type Resultado = { ok: boolean; error?: string; id?: string; msg?: string };

function revalidar(id?: string) {
  revalidatePath("/seguros");
  revalidatePath("/seguros/polizas");
  if (id) {
    revalidatePath(`/seguros/${id}`);
    revalidatePath(`/seguros/${id}/paquete`);
  }
  revalidatePath("/operaciones/hoja-vida");
  revalidatePath("/cartera/vehiculos");
}

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function fechaOk(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function aseguradoraOk(v: string): AseguradoraId {
  return ASEGURADORAS.some((a) => a.id === v) ? (v as AseguradoraId) : "";
}

function seccionOk(v: string): Seccion | null {
  return SECCIONES.some((s) => s.id === v) ? (v as Seccion) : null;
}

export async function crearCaso(fd: FormData): Promise<Resultado> {
  const vehiculoId = texto(fd.get("vehiculo_id"));
  const fecha = texto(fd.get("fecha")) || hoyPanama();
  const viaRaw = texto(fd.get("via"));
  const via = viaRaw === "fud" || viaRaw === "parte" ? viaRaw : null;
  if (!vehiculoId) return { ok: false, error: "Elija el carro." };
  if (!fechaOk(fecha)) return { ok: false, error: "La fecha del choque no es válida." };
  if (!via) return { ok: false, error: "Elija si es FUD o parte policivo." };

  const carros = await carrosParaCaso();
  const carro = carros.find((c) => c.id === vehiculoId);
  if (!carro) return { ok: false, error: "Ese carro no está en la flota." };

  const caso = casoVacio();
  caso.via = via;
  caso.seccion = "reportado";
  caso.lugar = texto(fd.get("lugar"));
  caso.relato = texto(fd.get("relato"));
  caso.clienteId = carro.clienteId;
  caso.clienteNombre = carro.cliente;
  caso.contratoId = carro.contratoId;
  caso.aseguradora = aseguradoraOk(texto(fd.get("aseguradora")));

  const creado = await crearFila({ vehiculoId, fecha, caso });
  if ("error" in creado) return { ok: false, error: creado.error };

  const pausa = await aplicarEstadoProductivo({
    vehiculoId,
    estado: "colision",
    fechaIngreso: fecha,
  });

  revalidar(creado.id);
  return {
    ok: true,
    id: creado.id,
    msg: pausa.ok ? "Caso abierto. El carro quedó en colisión." : `Caso abierto. ${pausa.msg}`,
  };
}

export async function eliminarCaso(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const fila = id ? await leerCaso(id) : null;
  if (!fila) return { ok: false, error: "No encuentro el caso." };

  for (const doc of fila.caso.documentos) {
    await borrarArchivo(doc.path);
  }
  const error = await borrarFila(id, fila.vehiculoId);
  if (error) return { ok: false, error };

  await borrarNotaColisionReportada(fila.vehiculoId, fila.fecha);

  const otros = (await listarCasos()).some((c) => c.vehiculoId === fila.vehiculoId);
  if (!otros) {
    const pausa = await pausaDeVehiculo(fila.vehiculoId);
    if (pausa?.estado === "colision") {
      const quitada = await borrarPausaColision(fila.vehiculoId, pausa.desde);
      if (quitada) {
        await dejarVehiculoActivo(fila.vehiculoId);
        await reponerLetras(fila.vehiculoId, pausa.desde, hoyPanama());
      }
    }
  }

  revalidar(id);
  revalidatePath("/cartera/estados-cuenta");
  return { ok: true, msg: "Choque eliminado." };
}

function montoOpcional(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function piezasDe(fd: FormData): Pieza[] {
  const nombres = fd.getAll("pieza").map((v) => String(v));
  const condiciones = fd.getAll("condicion").map((v) => String(v));
  const precios = fd.getAll("precio").map((v) => String(v));
  const preciosPieza = fd.getAll("precio_pieza").map((v) => String(v));
  const manos = fd.getAll("mano_obra").map((v) => String(v));
  const extras = new Set(fd.getAll("extra_idx").map((v) => String(v)));
  const ids = fd.getAll("pieza_id").map((v) => String(v));
  const out: Pieza[] = [];
  for (let i = 0; i < nombres.length; i++) {
    const pieza = nombres[i]?.trim() ?? "";
    if (!pieza) continue;
    const precio = Number(String(precios[i] ?? "").replace(",", "."));
    const precioPieza = montoOpcional(preciosPieza[i] ?? "");
    const manoObra = montoOpcional(manos[i] ?? "");
    out.push({
      id: ids[i] || crypto.randomUUID(),
      pieza,
      condicion: condiciones[i] === "reparar" ? "reparar" : "nueva",
      precio: Number.isFinite(precio) ? Math.max(precio, 0) : 0,
      extra: extras.has(String(i)),
      ...(precioPieza != null ? { precioPieza } : {}),
      ...(manoObra != null ? { manoObra } : {}),
    });
  }
  return out;
}

export async function guardarCaso(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const fila = id ? await leerCaso(id) : null;
  if (!fila) return { ok: false, error: "No encuentro el caso." };

  const fecha = texto(fd.get("fecha")) || fila.fecha;
  if (!fechaOk(fecha)) return { ok: false, error: "La fecha del choque no es válida." };
  const audiencia = fd.has("fecha_audiencia") ? texto(fd.get("fecha_audiencia")) : fila.caso.fechaAudiencia;
  if (audiencia && !fechaOk(audiencia)) return { ok: false, error: "La fecha de audiencia no es válida." };
  const audiencia2 = fd.has("fecha_audiencia_2") ? texto(fd.get("fecha_audiencia_2")) : fila.caso.fechaAudiencia2;
  if (audiencia2 && !fechaOk(audiencia2)) return { ok: false, error: "La segunda fecha de audiencia no es válida." };
  const pago = texto(fd.get("fecha_pago"));
  if (pago && !fechaOk(pago)) return { ok: false, error: "La fecha de pago no es válida." };

  const viaRaw = texto(fd.get("via"));
  const seccion = seccionOk(texto(fd.get("seccion"))) ?? fila.caso.seccion;
  const montoRaw = texto(fd.get("monto_finiquito")).replace(",", ".");
  const monto = montoRaw === "" ? null : Number(montoRaw);
  const kmRaw = texto(fd.get("km"));
  const km = kmRaw === "" ? null : Math.round(Number(kmRaw));

  const caso: Caso = {
    ...fila.caso,
    seccion,
    via: viaRaw === "fud" || viaRaw === "parte" ? viaRaw : fila.caso.via,
    lugar: texto(fd.get("lugar")),
    relato: texto(fd.get("relato")),
    aseguradora: aseguradoraOk(texto(fd.get("aseguradora"))),
    numeroReclamo: texto(fd.get("numero_reclamo")),
    numeroParte: texto(fd.get("numero_parte")),
    fechaAudiencia: audiencia,
    fechaAudiencia2: audiencia2,
    lugarAudiencia: fd.has("lugar_audiencia") ? texto(fd.get("lugar_audiencia")) : fila.caso.lugarAudiencia,
    conductor: texto(fd.get("conductor")),
    cedulaConductor: texto(fd.get("cedula_conductor")),
    placaCupo: texto(fd.get("placa_cupo")),
    asistencia: texto(fd.get("asistencia")),
    numeroTramite: texto(fd.get("numero_tramite")),
    ajustador: texto(fd.get("ajustador")),
    montoFiniquito: monto != null && Number.isFinite(monto) ? monto : null,
    fechaPago: pago,
    motivoNoProcede: texto(fd.get("motivo_no_procede")),
    observaciones: texto(fd.get("observaciones")),
    acuerdoFirmado: fd.get("acuerdo_firmado") === "1",
    piezas: piezasDe(fd),
  };
  if (caso.seccion === "pagado" && !caso.fechaPago) caso.fechaPago = hoyPanama();
  if (caso.avisoAudiencia && caso.avisoAudiencia !== caso.fechaAudiencia) caso.avisoAudiencia = null;

  const error = await guardarFila(id, fila.vehiculoId, fecha, Number.isFinite(km) ? km : null, caso.lugar, caso);
  if (error) return { ok: false, error };
  revalidar(id);
  return { ok: true };
}

export async function subirDocumento(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const tipo = texto(fd.get("tipo")) as DocTipo;
  const archivo = fd.get("archivo");
  if (!DOCUMENTOS.some((d) => d.id === tipo)) return { ok: false, error: "Ese documento no corresponde." };
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elija un archivo." };
  if (archivo.size > 8 * 1024 * 1024) return { ok: false, error: "El archivo pasa de 8 MB." };
  const fila = await leerCaso(id);
  if (!fila) return { ok: false, error: "No encuentro el caso." };

  const docId = crypto.randomUUID();
  const limpio = archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `seguros/casos/${id}/${docId}-${limpio}`;
  const error = await subirArchivo(path, new Uint8Array(await archivo.arrayBuffer()), archivo.type);
  if (error) return { ok: false, error };
  fila.caso.documentos.push({ id: docId, tipo, nombre: archivo.name, path });
  const guardado = await guardarFila(id, fila.vehiculoId, fila.fecha, fila.km, fila.caso.lugar, fila.caso);
  if (guardado) return { ok: false, error: guardado };
  revalidar(id);
  return { ok: true };
}

export async function quitarDocumento(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const docId = texto(fd.get("doc_id"));
  const fila = await leerCaso(id);
  if (!fila) return { ok: false, error: "No encuentro el caso." };
  const doc = fila.caso.documentos.find((d) => d.id === docId);
  if (!doc) return { ok: false, error: "Ese archivo ya no está." };
  await borrarArchivo(doc.path);
  fila.caso.documentos = fila.caso.documentos.filter((d) => d.id !== docId);
  const error = await guardarFila(id, fila.vehiculoId, fila.fecha, fila.km, fila.caso.lugar, fila.caso);
  if (error) return { ok: false, error };
  revalidar(id);
  return { ok: true };
}

export async function marcarAviso(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const cual = texto(fd.get("cual"));
  const fila = await leerCaso(id);
  if (!fila) return { ok: false, error: "No encuentro el caso." };
  if (cual === "oficina") fila.caso.avisoOficina = fila.fecha;
  if (cual === "audiencia") fila.caso.avisoAudiencia = fila.caso.fechaAudiencia || hoyPanama();
  const error = await guardarFila(id, fila.vehiculoId, fila.fecha, fila.km, fila.caso.lugar, fila.caso);
  if (error) return { ok: false, error };
  revalidar(id);
  return { ok: true };
}

export async function carroVolvio(fd: FormData): Promise<Resultado> {
  const id = texto(fd.get("id"));
  const fila = await leerCaso(id);
  if (!fila) return { ok: false, error: "No encuentro el caso." };
  const pausa = await aplicarEstadoProductivo({
    vehiculoId: fila.vehiculoId,
    estado: "activo",
    fechaIngreso: null,
  });
  revalidar(id);
  return pausa.ok ? { ok: true, msg: "El carro volvió a trabajar." } : { ok: false, error: pausa.msg };
}

export async function guardarPolizaAccion(fd: FormData): Promise<Resultado> {
  const vehiculoId = texto(fd.get("vehiculo_id"));
  const vence = texto(fd.get("vence"));
  if (!vehiculoId) return { ok: false, error: "Elija el carro." };
  if (!fechaOk(vence)) return { ok: false, error: "La fecha de vencimiento no es válida." };
  let path: string | null = null;
  const archivo = fd.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 8 * 1024 * 1024) return { ok: false, error: "El PDF pasa de 8 MB." };
    path = `seguros/polizas/${vehiculoId}/poliza`;
    const error = await subirArchivo(path, new Uint8Array(await archivo.arrayBuffer()), archivo.type || "application/pdf");
    if (error) return { ok: false, error };
  }
  const error = await guardarPoliza({
    vehiculoId,
    vence,
    aseguradora: aseguradoraOk(texto(fd.get("aseguradora"))),
    numero: texto(fd.get("numero")),
    path,
  });
  if (error) return { ok: false, error };
  revalidar();
  return { ok: true };
}

export async function subirDocEmpresa(fd: FormData): Promise<Resultado> {
  const empresaId = texto(fd.get("empresa_id"));
  const cual = texto(fd.get("cual"));
  const archivo = fd.get("archivo");
  if (!empresaId || (cual !== "registro" && cual !== "representante")) {
    return { ok: false, error: "Falta la empresa o el tipo de documento." };
  }
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elija el PDF." };
  const error = await subirArchivo(
    pathEmpresa(empresaId, cual),
    new Uint8Array(await archivo.arrayBuffer()),
    archivo.type || "application/pdf",
  );
  if (error) return { ok: false, error };
  revalidar();
  return { ok: true };
}

export async function subirDocCliente(fd: FormData): Promise<Resultado> {
  const casoId = texto(fd.get("id"));
  const clienteId = texto(fd.get("cliente_id"));
  const cual = texto(fd.get("cual"));
  const archivo = fd.get("archivo");
  if (!clienteId || (cual !== "cedula" && cual !== "licencia")) {
    return { ok: false, error: "Falta el cliente o el tipo de documento." };
  }
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elija un archivo." };
  if (archivo.size > 8 * 1024 * 1024) return { ok: false, error: "El archivo pasa de 8 MB." };
  const error = await subirArchivo(
    pathCliente(clienteId, cual),
    new Uint8Array(await archivo.arrayBuffer()),
    archivo.type || "application/octet-stream",
  );
  if (error) return { ok: false, error };
  revalidar(casoId || undefined);
  return { ok: true, msg: cual === "cedula" ? "Cédula guardada en el cliente." : "Licencia guardada en el cliente." };
}

export async function empresaDelCaso(vehiculoId: string) {
  return empresaDeVehiculo(vehiculoId);
}
