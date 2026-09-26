"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta-cache";
import { normalizarTelefono } from "@/lib/cartera/telefono";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** WhatsApp en E.164 (+507…) y teléfono local (8 dígitos) a partir del canónico. */
function armarTelefonos(celularRaw: string): { whatsapp: string; telefono: string; waNorm: string } | null {
  const waNorm = normalizarTelefono(celularRaw);
  if (!waNorm) return null;
  const telefono = waNorm.startsWith("507") && waNorm.length === 11 ? waNorm.slice(3) : waNorm;
  return { whatsapp: `+${waNorm}`, telefono, waNorm };
}

function volverVehiculos(msg: string): never {
  redirect(`/cartera/vehiculos?aviso=${encodeURIComponent(msg)}`);
}

export async function createVehiculo(formData: FormData): Promise<void> {
  const empresa_id = String(formData.get("empresa_id") ?? "");
  const numero = String(formData.get("numero") ?? "").trim();
  if (!empresa_id) volverVehiculos("Selecciona la empresa.");
  if (!numero) volverVehiculos("El número de carro es obligatorio.");

  const sb = createServerSupabase();
  const { error } = await sb.from("vehiculos").insert({
    empresa_id,
    numero,
    placa: str(formData.get("placa")),
    marca: str(formData.get("marca")),
    modelo: str(formData.get("modelo")),
    anio: num(formData.get("anio")),
    km_actual: num(formData.get("km_actual")) ?? 0,
    gps_id: str(formData.get("gps_id")),
    panapass: str(formData.get("panapass")),
    estado: String(formData.get("estado") ?? "activo"),
  });
  if (error) {
    if (/unique|duplicate|23505/i.test(error.message)) {
      volverVehiculos(`El carro ${numero} ya existe en esa empresa. No hace falta crearlo otra vez.`);
    }
    volverVehiculos(error.message);
  }

  revalidatePath("/cartera/vehiculos");
  volverVehiculos(`Carro ${numero} guardado.`);
}

export type ResultadoFicha = { ok: boolean; msg: string };

/**
 * Cambia el número del carro y, si tiene contrato activo, el nombre y el
 * celular del arrendatario. El siguiente extracto / recordatorio sale al
 * número nuevo (y con el nombre nuevo).
 */
export async function guardarIdentidadCarro(input: {
  vehiculoId: string;
  numero: string;
  clienteId: string | null;
  nombre: string | null;
  celular: string | null;
}): Promise<ResultadoFicha> {
  const id = String(input.vehiculoId ?? "").trim();
  const numero = String(input.numero ?? "").trim();
  const nombre = input.nombre == null ? null : String(input.nombre).trim();
  const celularRaw = input.celular == null ? null : String(input.celular).trim();
  if (!id) return { ok: false, msg: "Falta el carro." };
  if (!numero || numero.length > 20) return { ok: false, msg: "El número del carro es obligatorio." };

  const sb = createServerSupabase();
  const { data: contrato, error: cErr } = await sb
    .from("contratos")
    .select("id, cliente_id")
    .eq("vehiculo_id", id)
    .eq("estado", "activo")
    .maybeSingle();
  if (cErr) return { ok: false, msg: cErr.message };

  const clienteContrato = (contrato as { cliente_id: string } | null)?.cliente_id ?? null;
  if (input.clienteId && clienteContrato !== input.clienteId) {
    return { ok: false, msg: "Ese nombre no corresponde al contrato activo de este carro." };
  }
  if (clienteContrato && (!nombre || nombre.length < 2)) {
    return { ok: false, msg: "El nombre del arrendatario es obligatorio." };
  }

  let telefonos: ReturnType<typeof armarTelefonos> = null;
  if (clienteContrato) {
    if (!celularRaw) return { ok: false, msg: "El celular / WhatsApp es obligatorio." };
    telefonos = armarTelefonos(celularRaw);
    if (!telefonos) {
      return { ok: false, msg: "Celular inválido. Usa 8 dígitos o +507XXXXXXXX." };
    }
    // No pisar a otro cliente que ya tenga ese WhatsApp.
    const { data: choque } = await sb
      .from("clientes")
      .select("id, nombre")
      .or(`wa_norm.eq.${telefonos.waNorm},tel_norm.eq.${telefonos.waNorm}`)
      .neq("id", clienteContrato)
      .limit(1)
      .maybeSingle();
    if (choque) {
      const otro = (choque as { nombre?: string }).nombre ?? "otro cliente";
      return { ok: false, msg: `Ese celular ya está en ${otro}.` };
    }
  }

  const { error: vErr } = await sb.from("vehiculos").update({ numero }).eq("id", id);
  if (vErr) {
    if (/unique|duplicate|23505/i.test(vErr.message)) {
      return { ok: false, msg: "Ese número ya existe en esta empresa." };
    }
    return { ok: false, msg: vErr.message };
  }

  if (clienteContrato && nombre && telefonos) {
    const { error: nErr } = await sb
      .from("clientes")
      .update({
        nombre,
        whatsapp: telefonos.whatsapp,
        telefono: telefonos.telefono,
      })
      .eq("id", clienteContrato);
    if (nErr) return { ok: false, msg: nErr.message };

    // Reenganchar el chat al número nuevo para que inbox y espejo coincidan.
    const etiqueta = `Carro ${numero}`;
    const { data: convNueva } = await sb
      .from("conversaciones")
      .select("id, cliente_id")
      .eq("wa_numero", telefonos.waNorm)
      .maybeSingle();
    const convNuevaRow = convNueva as { id: string; cliente_id: string | null } | null;

    if (convNuevaRow && convNuevaRow.cliente_id && convNuevaRow.cliente_id !== clienteContrato) {
      return {
        ok: false,
        msg: "Ese celular ya tiene un chat de otro cliente. Revisá en Conversaciones.",
      };
    }

    if (convNuevaRow) {
      await sb
        .from("conversaciones")
        .update({
          cliente_id: clienteContrato,
          vehiculo_id: id,
          contrato_id: (contrato as { id: string }).id,
          etiqueta,
        })
        .eq("id", convNuevaRow.id);
      // Chats viejos del mismo cliente/carro: dejar de apuntar al vehículo
      // para no duplicar la ficha en el inbox.
      await sb
        .from("conversaciones")
        .update({ vehiculo_id: null, etiqueta: `${etiqueta} (número anterior)` })
        .eq("cliente_id", clienteContrato)
        .neq("id", convNuevaRow.id);
    } else {
      const { data: convVieja } = await sb
        .from("conversaciones")
        .select("id")
        .or(`vehiculo_id.eq.${id},cliente_id.eq.${clienteContrato}`)
        .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (convVieja) {
        const { error: waErr } = await sb
          .from("conversaciones")
          .update({
            wa_numero: telefonos.waNorm,
            cliente_id: clienteContrato,
            vehiculo_id: id,
            contrato_id: (contrato as { id: string }).id,
            etiqueta,
          })
          .eq("id", (convVieja as { id: string }).id);
        if (waErr && /unique|duplicate|23505/i.test(waErr.message)) {
          return { ok: false, msg: "No pude mover el chat: ese número ya tiene conversación." };
        }
        if (waErr) return { ok: false, msg: waErr.message };
      } else {
        await sb.from("conversaciones").insert({
          wa_numero: telefonos.waNorm,
          cliente_id: clienteContrato,
          vehiculo_id: id,
          contrato_id: (contrato as { id: string }).id,
          etiqueta,
        });
      }
    }
  } else {
    await sb.from("conversaciones").update({ etiqueta: `Carro ${numero}` }).eq("vehiculo_id", id);
  }

  invalidarLecturaEstados();
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/clientes");
  revalidatePath("/cartera/conversaciones");
  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera");
  revalidatePath("/operaciones/hoja-vida");
  revalidatePath(`/operaciones/hoja-vida/${id}`);
  return { ok: true, msg: "Ficha actualizada. Los próximos envíos usan este nombre y celular." };
}

export type ResultadoMasivo = { ok: boolean; msg: string; actualizados: number };

export type CambioVehiculo = {
  id: string;
  placa?: string | null;
  gps_id?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
};

/** Guarda ficha de varias filas a la vez (solo campos enviados). */
export async function guardarEdicionMasiva(cambios: CambioVehiculo[]): Promise<ResultadoMasivo> {
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { ok: false, msg: "No hay cambios.", actualizados: 0 };
  }
  if (cambios.length > 400) {
    return { ok: false, msg: "Máximo 400 filas por tanda.", actualizados: 0 };
  }

  const sb = createServerSupabase();
  let actualizados = 0;
  const errores: string[] = [];

  for (const c of cambios) {
    const id = String(c.id ?? "").trim();
    if (!id) continue;
    const patch: Record<string, string | number | null> = {};
    if ("placa" in c) {
      patch.placa = c.placa == null ? null : String(c.placa).trim().toUpperCase() || null;
    }
    if ("gps_id" in c) {
      patch.gps_id = c.gps_id == null ? null : String(c.gps_id).trim() || null;
    }
    if ("marca" in c) {
      patch.marca = c.marca == null ? null : String(c.marca).trim() || null;
    }
    if ("modelo" in c) {
      patch.modelo = c.modelo == null ? null : String(c.modelo).trim() || null;
    }
    if ("anio" in c) {
      const a = c.anio == null || c.anio === ("" as unknown) ? null : Number(c.anio);
      patch.anio = a != null && Number.isFinite(a) ? a : null;
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await sb.from("vehiculos").update(patch).eq("id", id);
    if (error) errores.push(error.message);
    else actualizados++;
  }

  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/rastreo");
  if (errores.length && actualizados === 0) {
    return { ok: false, msg: errores[0]!, actualizados: 0 };
  }
  return {
    ok: true,
    msg: errores.length
      ? `Guardé ${actualizados}. Algunos fallaron: ${errores[0]}`
      : `Guardé ${actualizados} carro${actualizados === 1 ? "" : "s"}.`,
    actualizados,
  };
}

/** Rellena placa vacía con la que reporta Diacor para el gps_id amarrado. */
export async function completarPlacasDesdeDiacor(): Promise<ResultadoMasivo> {
  const { diacorConfigurado, posicionesGps } = await import("@/lib/gps/diacor");
  const { normalizarPlaca } = await import("@/lib/gps/vincular");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }

  function placaOk(raw: string | null | undefined): string | null {
    const p = normalizarPlaca(raw);
    if (!/^[A-Z]{1,3}\d{3,4}$/.test(p)) return null;
    return p;
  }

  try {
    const sb = createServerSupabase();
    const [{ data: veh }, posiciones] = await Promise.all([
      sb.from("vehiculos").select("id, placa, gps_id").neq("estado", "entregado"),
      posicionesGps(),
    ]);
    const porGps = new Map(posiciones.map((p) => [p.id_dispositivo, p]));
    let n = 0;
    for (const v of (veh ?? []) as { id: string; placa: string | null; gps_id: string | null }[]) {
      if (placaOk(v.placa) || !v.gps_id) continue;
      const placa = placaOk(porGps.get(v.gps_id)?.placa ?? null);
      if (!placa) continue;
      const { error } = await sb.from("vehiculos").update({ placa }).eq("id", v.id);
      if (!error) n++;
    }
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    return {
      ok: true,
      msg: n === 0 ? "Ninguna placa nueva en Diacor para carros sin placa." : `Completé ${n} placa${n === 1 ? "" : "s"} desde Diacor.`,
      actualizados: n,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude leer Diacor.", actualizados: 0 };
  }
}

/** Guarda el km de hoy (odómetro / Diacor) y lo suma al mes en gps_dias. */
export async function actualizarKmHoy(): Promise<ResultadoMasivo> {
  const { diacorConfigurado } = await import("@/lib/gps/diacor");
  const { revisarGpsDelDia } = await import("@/lib/gps/revisar-dia");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }
  try {
    const r = await revisarGpsDelDia(undefined, { alertarParado: false });
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    return {
      ok: true,
      msg: `Km de hoy: ${r.revisados} carros (${r.porOdometro} odómetro, ${r.porRecorrido} Diacor).`,
      actualizados: r.revisados,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude actualizar km.", actualizados: 0 };
  }
}

/**
 * Una sola vez / huecos: pide a Diacor el recorrido 1 del mes → hoy.
 * El día a día lo lleva el cron; esto solo rellena lo que falte del mes.
 */
export async function rellenarKmDelMes(): Promise<ResultadoMasivo> {
  const { diacorConfigurado } = await import("@/lib/gps/diacor");
  const { cargarKmRango, rangoMesEnCurso } = await import("@/lib/gps/cargar-km-rango");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }
  try {
    const { desde, hasta } = rangoMesEnCurso();
    const r = await cargarKmRango(desde, hasta);
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    if (!r.ok) return { ok: false, msg: r.error ?? "No pude rellenar el mes.", actualizados: 0 };
    return {
      ok: true,
      msg: `Mes ${desde}→${hasta}: ${r.guardados} lecturas, ${Math.round(r.kmTotal).toLocaleString("es-PA")} km.`,
      actualizados: r.guardados,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude rellenar el mes.", actualizados: 0 };
  }
}
