// Corrección de un día del histórico. Cambia el cargo o el pago de verdad
// y deja una marca de control: quién y cuándo. La marca no entra al saldo.

import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta-cache";
import { CONCEPTOS_PAGO } from "@/lib/cartera/rubros-pago";
import { lineasAsignadas } from "@/lib/cartera/recargo-cubierto";
import { esMarcaQc, historicoDeContrato, MARCA_QC, type FilaHistorico } from "@/lib/cartera/historico-cuenta";

export type CargoEditado = { id: string; monto: number };
export type LineaEditada = { tipo: string; aplicado: number };
export type PagoEditado = { id: string; monto: number; lineas: LineaEditada[] };

const TIPOS = new Set<string>(CONCEPTOS_PAGO.map((c) => c.value));

function r2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function etiquetaDe(tipo: string): string {
  return CONCEPTOS_PAGO.find((c) => c.value === tipo)?.label.toLowerCase() ?? tipo;
}

function money(n: number): string {
  const v = r2(n);
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

export async function guardarDiaHistorico(input: {
  contratoId: string;
  fecha: string;
  cargos: CargoEditado[];
  pagos: PagoEditado[];
  nuevoCargo?: { tipo: string; concepto: string; monto: number } | null;
}): Promise<{ ok: true; filas: FilaHistorico[] } | { ok: false; error: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "Entrá con tu usuario del equipo para corregir." };

  const contratoId = String(input.contratoId ?? "").trim();
  const fecha = String(input.fecha ?? "").slice(0, 10);
  if (!contratoId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Día inválido." };
  }

  const sb = createServerSupabase();
  const [{ data: cargosDb, error: ec }, { data: pagosDb, error: ep }] = await Promise.all([
    sb
      .from("cargos")
      .select("id, fecha, monto, concepto, concepto_codigo")
      .eq("contrato_id", contratoId)
      .eq("fecha", fecha),
    sb
      .from("pagos")
      .select("id, fecha, monto, notas, estado_conciliacion, asignaciones")
      .eq("contrato_id", contratoId)
      .eq("fecha", fecha),
  ]);
  if (ec) return { ok: false, error: ec.message };
  if (ep) return { ok: false, error: ep.message };

  const cargosVivos = new Map(
    ((cargosDb ?? []) as { id: string; monto: number; concepto: string | null; concepto_codigo: string | null }[])
      .filter((c) => !esMarcaQc(c))
      .map((c) => [c.id, c]),
  );
  const pagosVivos = new Map(
    ((pagosDb ?? []) as {
      id: string;
      monto: number;
      notas: string | null;
      estado_conciliacion: string;
      asignaciones: unknown;
    }[])
      .filter((p) => p.estado_conciliacion !== "rechazado")
      .map((p) => [p.id, p]),
  );

  const cambios: string[] = [];

  for (const c of input.cargos ?? []) {
    const prev = cargosVivos.get(c.id);
    if (!prev) return { ok: false, error: "Un cargo de ese día ya no está." };
    const monto = r2(c.monto);
    if (monto < 0) return { ok: false, error: "Un cargo no puede quedar en negativo." };
    if (Math.abs(monto - Number(prev.monto)) <= 0.009) continue;
    const { error } = await sb.from("cargos").update({ monto }).eq("id", c.id).eq("contrato_id", contratoId);
    if (error) return { ok: false, error: error.message };
    const nombre = (prev.concepto ?? "Cargo").replace(/\s*\[\[.*?\]\]\s*/g, " ").trim();
    cambios.push(`${nombre} ${money(Number(prev.monto))} → ${money(monto)}`);
  }

  for (const p of input.pagos ?? []) {
    const prev = pagosVivos.get(p.id);
    if (!prev) return { ok: false, error: "Un pago de ese día ya no está." };
    const monto = r2(p.monto);
    if (monto < 0) return { ok: false, error: "Un pago no puede quedar en negativo." };
    const lineas = (p.lineas ?? [])
      .map((l) => ({ tipo: l.tipo, aplicado: r2(l.aplicado) }))
      .filter((l) => l.aplicado > 0.009);
    if (monto > 0.009 && lineas.length === 0) {
      return { ok: false, error: "Indicá a qué se aplicó el pago." };
    }
    if (lineas.some((l) => !TIPOS.has(l.tipo))) return { ok: false, error: "Hay un destino de pago que no existe." };
    const suma = r2(lineas.reduce((s, l) => s + l.aplicado, 0));
    if (lineas.length > 0 && Math.abs(suma - monto) > 0.02) {
      return { ok: false, error: "Lo aplicado tiene que sumar el pago." };
    }
    const antes = lineasAsignadas(prev.asignaciones)
      .map((l) => `${l.tipo}:${r2(l.aplicado)}`)
      .join("|");
    const despues = lineas.map((l) => `${l.tipo}:${l.aplicado}`).join("|");
    const montoIgual = Math.abs(monto - Number(prev.monto)) <= 0.009;
    if (montoIgual && antes === despues) continue;
    const asignaciones =
      lineas.length === 0
        ? null
        : {
            sobrante: 0,
            totalAplicado: monto,
            asignaciones: lineas.map((l) => ({
              tipo: l.tipo,
              aplicado: l.aplicado,
              etiqueta: etiquetaDe(l.tipo),
            })),
          };
    const nota = `Corregido en el histórico por ${sesion.nombre}.`;
    const notas = prev.notas?.includes(nota) ? prev.notas : `${prev.notas ?? ""} ${nota}`.trim();
    const { error } = await sb
      .from("pagos")
      .update({
        monto,
        ...(asignaciones ? { asignaciones } : {}),
        notas,
      })
      .eq("id", p.id)
      .eq("contrato_id", contratoId);
    if (error) return { ok: false, error: error.message };
    if (!montoIgual) cambios.push(`Pago ${money(Number(prev.monto))} → ${money(monto)}`);
    else cambios.push(`Pago ${money(monto)} reasignado`);
  }

  if (cambios.length === 0 && !(input.nuevoCargo && r2(input.nuevoCargo.monto) > 0.009)) {
    return { ok: false, error: "No hay ningún cambio para guardar." };
  }

  const nuevo = input.nuevoCargo;
  const montoNuevo = r2(nuevo?.monto ?? 0);
  if (montoNuevo > 0.009) {
    const tipos = new Set(["renta", "multa", "otras", "ajuste", "panapass", "exceso_km", "afiliacion"]);
    const tipo = tipos.has(nuevo?.tipo ?? "") ? nuevo!.tipo : "otras";
    const concepto = (nuevo?.concepto ?? "").trim() || "Ajuste";
    const { error } = await sb.from("cargos").insert({
      contrato_id: contratoId,
      fecha,
      tipo,
      concepto,
      monto: montoNuevo,
    });
    if (error) return { ok: false, error: error.message };
    cambios.push(`${concepto} ${money(montoNuevo)} agregado`);
  }

  const concepto = `${MARCA_QC} Editado por ${sesion.nombre} · ${cambios.join(" · ")}`.slice(0, 500);
  const { error: eq } = await sb.from("cargos").insert({
    contrato_id: contratoId,
    fecha,
    tipo: "ajuste",
    concepto,
    monto: 0,
  });
  if (eq) return { ok: false, error: eq.message };

  invalidarLecturaEstados(contratoId);
  return historicoDeContrato(contratoId);
}
