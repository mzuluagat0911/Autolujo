// Si el cliente dice que pagó ayer, anoche o antier, la respuesta sale de la
// base de ese día. "Hoy no hay pago" no borra el de ayer.

import { createServerSupabase } from "@/lib/supabase/server";
import { diaSemana, fechaConDia, fechaContable, horaPanama, hoyPanama, sumarDias } from "./fecha";

const HABLA_DE_PAGO =
  /\b(pagu[eé]|pag(o|ar|ue|amos)|cancel[eé]|consign[eé]|transfer[ií]|deposit[eé]|abon[eé]|comprobante|ya\s+les)\b/i;

const NIEGA =
  /no me aparece|no aparece|no veo|no tengo (ning|un pago|el pago)|no hay (ning[uú]n )?pago|no est[aá] (ese |el |ning)/i;

const AFIRMA = /s[ií],?\s+(el\s+)?pago|s[ií]\s+est[aá]|ese\s+pago\s+s[ií]|el\s+de\s+(ayer|antier|anoche)\s+s[ií]/i;

type EstadoPago = "conciliado" | "manual" | "pendiente" | "rechazado" | string;

export type PagoDia = {
  monto: number;
  pagadoAt: string;
  fecha: string;
  estado: EstadoPago;
};

export type DiaPedido = {
  fecha: string;
  /** hoy, ayer, antier, o el nombre del día. */
  como: string;
};

export type ConsultaPago = {
  modo: "confirmar" | "negar" | "preguntar";
  bloque: string;
  /** Sale solo si la respuesta del modelo contradice la base. */
  frase: string;
};

function fold(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function dinero(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

function comoDe(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  if (fecha === sumarDias(hoy, -1)) return "ayer";
  if (fecha === sumarDias(hoy, -2)) return "antier";
  return fechaConDia(fecha);
}

const DIAS_NOMBRE = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** Días que el cliente nombró. Vacío si habló de un pago sin decir cuál. */
export function diasDePagoMencionados(texto: string, hoy: string): { habla: boolean; dias: DiaPedido[] } {
  const t = fold(texto);
  const habla = HABLA_DE_PAGO.test(t) || /\b(anoche|ayer|antier|anteayer)\b/.test(t);
  if (!habla) return { habla: false, dias: [] };

  const fechas = new Map<string, string>();
  const poner = (fecha: string, como: string) => {
    if (!fechas.has(fecha)) fechas.set(fecha, como);
  };

  if (/\b(antier|anteayer|antes de ayer)\b/.test(t)) poner(sumarDias(hoy, -2), "antier");
  if (/\b(anoche|ayer)\b/.test(t)) poner(sumarDias(hoy, -1), "ayer");
  if (/\b(hoy|esta manana|esta tarde)\b/.test(t)) poner(hoy, "hoy");

  for (let dow = 0; dow < 7; dow++) {
    const nombre = DIAS_NOMBRE[dow];
    if (!new RegExp(`\\b${nombre}\\b`).test(t)) continue;
    const delta = (diaSemana(hoy) - dow + 7) % 7;
    const fecha = sumarDias(hoy, -delta);
    poner(fecha, comoDe(fecha, hoy));
  }

  const dias = [...fechas.entries()].map(([fecha, como]) => ({ fecha, como }));
  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { habla: true, dias };
}

function validado(estado: string): boolean {
  return estado === "conciliado" || estado === "manual";
}

function detalleDia(pagos: PagoDia[]): { hay: boolean; texto: string } {
  const vivos = pagos.filter((p) => p.estado !== "rechazado");
  if (vivos.length === 0) {
    return pagos.some((p) => p.estado === "rechazado")
      ? { hay: false, texto: "el comprobante de ese día está rechazado" }
      : { hay: false, texto: "" };
  }
  return {
    hay: true,
    texto: vivos
      .map((p) => {
        const hora = horaPanama(new Date(p.pagadoAt));
        if (validado(p.estado)) return `${dinero(p.monto)} validado a las ${hora}`;
        if (p.estado === "pendiente") return `${dinero(p.monto)} en validación (todavía no baja el saldo) a las ${hora}`;
        return `${dinero(p.monto)} (${p.estado})`;
      })
      .join("; "),
  };
}

export function armarConsulta(
  pedido: { habla: boolean; dias: DiaPedido[] },
  porFecha: Map<string, PagoDia[]>,
  hoy: string,
): ConsultaPago | null {
  if (!pedido.habla) return null;

  if (pedido.dias.length === 0) {
    return {
      modo: "preguntar",
      bloque: [
        `CONSULTA DE PAGO EN BASE:`,
        `- Habló de un pago y no dijo de qué día es.`,
        `- Pregúntale si se refiere al de ayer, al de antier o al de hoy.`,
        `- PROHIBIDO decir que no aparece. Primero pregunta el día.`,
      ].join("\n"),
      frase: "¿De qué día es ese pago: de ayer, de antier o de hoy?",
    };
  }

  const de = (fecha: string) => detalleDia(porFecha.get(fecha) ?? []);
  const lineas = pedido.dias.map((d) => {
    const det = de(d.fecha);
    const cuando = `${d.como} (${fechaConDia(d.fecha)})`;
    return det.hay
      ? `- ${cuando}: SÍ está. ${det.texto}.`
      : `- ${cuando}: NO hay pago en la base.${det.texto ? ` ${det.texto}.` : ""}`;
  });
  if (pedido.dias.some((d) => d.fecha !== hoy)) {
    const detHoy = de(hoy);
    lineas.push(
      detHoy.hay
        ? `- hoy (${fechaConDia(hoy)}), por separado: ${detHoy.texto}.`
        : `- hoy (${fechaConDia(hoy)}), por separado: no tiene pago validado. El TOTAL A PAGAR HOY de arriba sigue.`,
    );
  }
  const alguno = pedido.dias.some((d) => de(d.fecha).hay);
  const soloHoy = pedido.dias.length === 1 && pedido.dias[0].fecha === hoy;
  const ayerSi = pedido.dias.some((d) => d.fecha !== hoy && de(d.fecha).hay);

  let frase: string;
  let modo: ConsultaPago["modo"];
  if (!alguno) {
    modo = "negar";
    frase = "Ese día no me aparece un pago. Mándeme la foto del comprobante.";
  } else if (ayerSi && !soloHoy) {
    modo = "confirmar";
    const partes = pedido.dias
      .filter((d) => d.fecha !== hoy)
      .map((d) => {
        const det = de(d.fecha);
        return det.hay ? `el de ${d.como} sí está (${det.texto})` : `el de ${d.como} no me aparece`;
      });
    const hoyPagos = de(hoy).hay ? de(hoy).texto : "";
    const cola = hoyPagos
      ? ` Lo de hoy es aparte: ${hoyPagos}.`
      : ` Lo de hoy es aparte.`;
    frase = `Sí, ${partes.join(". ")}.${cola}`;
  } else {
    modo = "confirmar";
    frase = `Sí, el pago de ${pedido.dias[0].como} sí está: ${de(pedido.dias[0].fecha).texto}.`;
  }

  return {
    modo,
    bloque: [
      `CONSULTA DE PAGO EN BASE (ya consultada; obedece esto, no lo niegues):`,
      ...lineas,
      ayerSi
        ? `- Si el de ayer o el de antier sí está, confírmalo y separa lo de hoy. PROHIBIDO decir que ese pago no aparece.`
        : modo === "negar"
          ? `- Ese día no está. Pide la foto. No digas que sí está.`
          : `- Confirma lo que la base dice de ese día.`,
    ].join("\n"),
    frase,
  };
}

export function corregirRespuestaPago(mensaje: string, consulta: ConsultaPago | null): string {
  if (!consulta) return mensaje;
  const niega = NIEGA.test(mensaje);
  const afirma = AFIRMA.test(mensaje);
  if (consulta.modo === "confirmar" && niega && !afirma) return consulta.frase;
  if (consulta.modo === "negar" && afirma && !niega) return consulta.frase;
  if (consulta.modo === "preguntar" && niega && !afirma) return consulta.frase;
  return mensaje;
}

export async function consultarPagoMencionado(
  contratoId: string,
  textoCliente: string,
  hoy = hoyPanama(),
): Promise<ConsultaPago | null> {
  const pedido = diasDePagoMencionados(textoCliente, hoy);
  if (!pedido.habla) return null;
  if (pedido.dias.length === 0) return armarConsulta(pedido, new Map(), hoy);

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select("monto, pagado_at, fecha, estado_conciliacion")
    .eq("contrato_id", contratoId)
    .order("pagado_at", { ascending: false })
    .limit(40);
  if (error) {
    console.error("[consulta-pago]", error.message);
    return null;
  }
  const filas = (data ?? []) as {
    monto: number;
    pagado_at: string;
    fecha: string | null;
    estado_conciliacion: string;
  }[];
  const porFecha = new Map<string, PagoDia[]>();
  for (const d of pedido.dias) porFecha.set(d.fecha, []);
  if (!porFecha.has(hoy)) porFecha.set(hoy, []);
  for (const p of filas) {
    const dia = fechaContable(p.pagado_at) || (p.fecha ?? "").slice(0, 10);
    if (!porFecha.has(dia)) continue;
    porFecha.get(dia)!.push({
      monto: Number(p.monto) || 0,
      pagadoAt: p.pagado_at,
      fecha: dia,
      estado: p.estado_conciliacion,
    });
  }
  return armarConsulta(pedido, porFecha, hoy);
}
