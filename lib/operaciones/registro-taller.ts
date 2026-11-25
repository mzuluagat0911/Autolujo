// Registro de visita de taller. Misma ficha para Agenda web y (luego) WA Néstor.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { DIAS_REVISION_MENSUAL } from "./alertas";
import { etiquetaSedeTaller, type SedeTaller } from "./sede-entrega";
import type { TipoCitaTaller } from "./agenda";

export const ITEMS_FULL = [
  { id: "filtro_ac", label: "Filtro de A/C", campo: "full_filtro_ac" },
  { id: "filtro_motor", label: "Filtro de motor", campo: "full_filtro_motor" },
  { id: "filtro_aceite", label: "Filtro de aceite", campo: "full_filtro_aceite" },
  { id: "cuartos_aceite", label: "4 cuartos de aceite", campo: "full_cuartos_aceite" },
  { id: "ajuste_liquidos", label: "Ajuste de líquidos", campo: "full_ajuste_liquidos" },
] as const;

export const ITEMS_KIT_DEFAULT = [
  "Aceite de transmisión",
  "Filtro de transmisión",
  "Bujías",
  "Cables de bujías",
  "Correa de servicio",
  "Tacos de freno",
  "Tapa de radiador",
  "Ajuste y limpieza a las bandas de freno",
  "Limpieza al cuerpo de aceleración",
] as const;

export const PRECIO_KIT_MANUAL = 212;
export const PRECIO_KIT_AUTO = 234;
export const FOTOS_MINIMAS = 5;

const BUCKET = "comprobantes";

export type InputRegistroTaller = {
  citaId?: string | null;
  vehiculoId: string;
  clienteId?: string | null;
  tipo: TipoCitaTaller | "atf";
  fecha: string;
  sucursal: SedeTaller;
  km?: number | null;
  asistencia?: "llego" | "no_llego" | "cancelada";
  // FULL
  fullFiltroAc?: boolean;
  fullFiltroMotor?: boolean;
  fullFiltroAceite?: boolean;
  fullCuartosAceite?: boolean;
  fullAjusteLiquidos?: boolean;
  promoGratis?: boolean;
  montoCobrado?: number | null;
  stickerOk?: boolean;
  carroLimpio?: boolean | null;
  // Kit
  transmision?: "manual" | "automatico" | null;
  montoClienteKit?: number | null;
  itemsKit?: string[];
  // Mecánica
  trabajo?: string | null;
  operativo?: boolean | null;
  costoEdison?: number | null;
  comentario?: string | null;
  avisoCarteraMulta?: boolean;
  motivoMulta?: string | null;
  origen?: "agenda_web" | "whatsapp_nestor";
  creadoPor?: string | null;
  /** Paths ya subidos a storage, o se suben desde `fotos`. */
  fotoPaths?: { path: string; esSticker?: boolean }[];
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function precioListaKit(transmision: "manual" | "automatico"): number {
  return transmision === "manual" ? PRECIO_KIT_MANUAL : PRECIO_KIT_AUTO;
}

export async function guardarRegistroTaller(
  input: InputRegistroTaller,
): Promise<{ ok: true; id: string; msg: string; proximaFecha: string | null } | { ok: false; msg: string }> {
  const vehiculoId = String(input.vehiculoId ?? "").trim();
  const fecha = String(input.fecha ?? "").trim();
  const tipo = input.tipo;
  const sucursal = input.sucursal;
  if (!vehiculoId) return { ok: false, msg: "Falta el carro." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, msg: "Fecha inválida." };
  if (sucursal !== "juan_diaz" && sucursal !== "chorrera") {
    return { ok: false, msg: "Indicá la sede (Juan Díaz o La Chorrera)." };
  }

  const asistencia = input.asistencia ?? "llego";
  const km = input.km != null && Number.isFinite(input.km) ? Math.round(Number(input.km)) : null;
  const fotos = input.fotoPaths ?? [];
  const llegoYTrabajo = asistencia === "llego";

  if (llegoYTrabajo && tipo === "mantenimiento_6000") {
    const items = [
      input.fullFiltroAc,
      input.fullFiltroMotor,
      input.fullFiltroAceite,
      input.fullCuartosAceite,
      input.fullAjusteLiquidos,
    ];
    if (items.some((x) => !x)) {
      return { ok: false, msg: "En el FULL marcá los 3 filtros, los 4 cuartos de aceite y el ajuste de líquidos." };
    }
    if (!input.stickerOk) return { ok: false, msg: "Confirmá que pegaste el sticker (y subí su foto)." };
    if (fotos.length < FOTOS_MINIMAS) {
      return { ok: false, msg: `Subí al menos ${FOTOS_MINIMAS} fotos (una debe ser del sticker).` };
    }
    if (!fotos.some((f) => f.esSticker)) {
      return { ok: false, msg: "Marcá cuál foto es del sticker." };
    }
  }

  if (llegoYTrabajo && tipo === "kit_tiempos") {
    if (input.transmision !== "manual" && input.transmision !== "automatico") {
      return { ok: false, msg: "Indicá si el kit es manual o automático." };
    }
    if (input.montoClienteKit == null || !(Number(input.montoClienteKit) >= 0)) {
      return { ok: false, msg: "Indicá cuánto asume el cliente del kit." };
    }
    if (fotos.length < FOTOS_MINIMAS) {
      return { ok: false, msg: `Subí al menos ${FOTOS_MINIMAS} fotos del kit.` };
    }
  }

  if (llegoYTrabajo && (tipo === "revision_mensual" || tipo === "atf" || tipo === "mecanica")) {
    if (fotos.length < FOTOS_MINIMAS) {
      return { ok: false, msg: `Subí al menos ${FOTOS_MINIMAS} fotos.` };
    }
  }

  const sb = createServerSupabase();
  let proximaFecha: string | null = null;
  const transmision = input.transmision ?? null;
  const precioLista = transmision ? precioListaKit(transmision) : null;
  const promo = !!input.promoGratis;
  const montoCobrado = promo
    ? 0
    : input.montoCobrado != null
      ? r2(Number(input.montoCobrado))
      : null;

  const { data: reg, error } = await sb
    .from("registros_taller")
    .insert({
      cita_id: input.citaId ?? null,
      vehiculo_id: vehiculoId,
      cliente_id: input.clienteId ?? null,
      tipo,
      fecha,
      sucursal,
      km,
      asistencia,
      full_filtro_ac: !!input.fullFiltroAc,
      full_filtro_motor: !!input.fullFiltroMotor,
      full_filtro_aceite: !!input.fullFiltroAceite,
      full_cuartos_aceite: !!input.fullCuartosAceite,
      full_ajuste_liquidos: !!input.fullAjusteLiquidos,
      promo_gratis: promo,
      monto_cobrado: montoCobrado,
      sticker_ok: !!input.stickerOk,
      carro_limpio: input.carroLimpio ?? null,
      transmision,
      precio_lista_kit: precioLista,
      monto_cliente_kit: input.montoClienteKit != null ? r2(Number(input.montoClienteKit)) : null,
      items_kit: input.itemsKit ?? [],
      trabajo: input.trabajo?.trim() || null,
      operativo: input.operativo ?? null,
      costo_edison: input.costoEdison != null ? r2(Number(input.costoEdison)) : null,
      comentario: input.comentario?.trim() || null,
      aviso_cartera_multa: !!input.avisoCarteraMulta,
      motivo_multa: input.motivoMulta?.trim() || null,
      origen: input.origen ?? "agenda_web",
      creado_por: input.creadoPor ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !reg) {
    if (/registros_taller|schema cache/i.test(error?.message ?? "")) {
      return { ok: false, msg: "Falta aplicar la migración 0059 (registros de taller)." };
    }
    return { ok: false, msg: error?.message ?? "No pude guardar el registro." };
  }

  const registroId = (reg as { id: string }).id;
  if (fotos.length) {
    const rows = fotos.map((f) => ({
      registro_id: registroId,
      path: f.path,
      es_sticker: !!f.esSticker,
    }));
    const { error: fErr } = await sb.from("registros_taller_fotos").insert(rows);
    if (fErr) console.error("[registro-taller] fotos", fErr.message);
  }

  // Anclas + hoja de vida solo si llegó y se atendió
  if (llegoYTrabajo) {
    const lugar = etiquetaSedeTaller(sucursal);
    const detalle = input.comentario?.trim() || null;

    if (tipo === "revision_mensual") {
      proximaFecha = sumarDias(fecha, DIAS_REVISION_MENSUAL);
      await sb.from("vehiculos").update({ fecha_ultima_revision: fecha }).eq("id", vehiculoId);
      await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "revision",
        titulo: "Revisión mensual",
        detalle: detalle || "Revisión mensual atendida",
        lugar,
        km,
        origen: input.origen ?? "agenda_web",
      });
    } else if (tipo === "mantenimiento_6000") {
      const patch: Record<string, unknown> = { fecha_ultimo_mantenimiento: fecha };
      if (km != null) patch.km_ultimo_mantenimiento = km;
      await sb.from("vehiculos").update(patch).eq("id", vehiculoId);
      await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "mantenimiento",
        titulo: "Mantenimiento 6.000 km (FULL)",
        detalle:
          detalle ||
          "FULL: filtros A/C, motor, aceite · 4 cuartos · ajuste líquidos" +
            (promo ? " · promo gratis" : ""),
        lugar,
        km,
        valor: montoCobrado,
        origen: input.origen ?? "agenda_web",
      });
    } else if (tipo === "kit_tiempos") {
      await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "mantenimiento",
        titulo: `Kit de tiempos (${transmision})`,
        detalle:
          detalle ||
          `Lista $${precioLista}. Cliente asume $${r2(Number(input.montoClienteKit ?? 0))}.`,
        lugar,
        km,
        valor: input.montoClienteKit != null ? r2(Number(input.montoClienteKit)) : precioLista,
        origen: input.origen ?? "agenda_web",
      });
    } else if (tipo === "atf") {
      await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "mantenimiento",
        titulo: "Aceite ATF (50.000)",
        detalle: detalle || "ATF + filtro",
        lugar,
        km,
        valor: montoCobrado,
        origen: input.origen ?? "agenda_web",
      });
    } else {
      await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "novedad",
        titulo: "Cita mecánica",
        detalle: (detalle || input.trabajo || "Trabajo de taller").slice(0, 500),
        lugar,
        km,
        valor: input.costoEdison ?? null,
        origen: input.origen ?? "agenda_web",
      });
    }

    await sb.from("registros_taller").update({ proxima_fecha: proximaFecha }).eq("id", registroId);
  }

  if (input.citaId) {
    await sb
      .from("citas_taller")
      .update({
        estado: asistencia === "llego" ? "hecha" : asistencia,
        km_al_atender: km,
        proxima_fecha: proximaFecha,
        atendido_at: new Date().toISOString(),
        actualizado_por: input.creadoPor ?? null,
        updated_at: new Date().toISOString(),
        comentario: input.comentario?.trim() || undefined,
      })
      .eq("id", input.citaId);
  }

  const multa = input.avisoCarteraMulta
    ? " Aviso a Cartera por multa marcado."
    : "";
  const msg = llegoYTrabajo
    ? proximaFecha
      ? `Registro guardado. Próxima revisión ~ ${proximaFecha.split("-").reverse().join("/")}.${multa}`
      : tipo === "mantenimiento_6000"
        ? `FULL guardado. Próximo por km GPS.${multa}`
        : `Registro guardado.${multa}`
    : `Asistencia registrada (${asistencia}).${multa}`;

  return { ok: true, id: registroId, msg, proximaFecha };
}

export async function subirFotosRegistro(
  registroIdPlaceholder: string,
  files: { bytes: Buffer; mime: string; name: string; esSticker?: boolean }[],
): Promise<{ path: string; esSticker: boolean }[]> {
  const sb = createServerSupabase();
  const out: { path: string; esSticker: boolean }[] = [];
  const stamp = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const ext = f.mime.includes("png") ? "png" : f.mime.includes("webp") ? "webp" : "jpg";
    const path = `taller/${registroIdPlaceholder}/${stamp}-${i}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f.bytes, {
      contentType: f.mime,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    out.push({ path, esSticker: !!f.esSticker });
  }
  return out;
}

export async function listarRegistrosDelDia(fecha = hoyPanama()): Promise<{
  filas: {
    id: string;
    tipo: string;
    carro: string;
    sucursal: string;
    km: number | null;
    avisoMulta: boolean;
    createdAt: string;
  }[];
  error: string | null;
}> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("registros_taller")
    .select(
      "id, tipo, sucursal, km, aviso_cartera_multa, created_at, vehiculo:vehiculos(numero, empresa:empresas(codigo))",
    )
    .eq("fecha", fecha)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (/registros_taller|schema cache/i.test(error.message)) {
      return { filas: [], error: "Falta aplicar la migración 0059." };
    }
    return { filas: [], error: error.message };
  }
  const { etiquetaCarroUi } = await import("@/lib/cartera/empresa");
  const filas = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const vehRaw = r.vehiculo;
    const veh = Array.isArray(vehRaw) ? vehRaw[0] : vehRaw;
    const v = veh as {
      numero?: string;
      empresa?: { codigo?: string } | { codigo?: string }[] | null;
    } | null;
    const empRaw = v?.empresa;
    const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
    return {
      id: String(r.id),
      tipo: String(r.tipo),
      carro: etiquetaCarroUi(emp, v?.numero ?? "?"),
      sucursal: etiquetaSedeTaller(String(r.sucursal)),
      km: r.km != null ? Number(r.km) : null,
      avisoMulta: !!r.aviso_cartera_multa,
      createdAt: String(r.created_at ?? ""),
    };
  });
  return { filas, error: null };
}
