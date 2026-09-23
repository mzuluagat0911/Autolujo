// Liquidación mensual de exceso de kilometraje (código 122).
//
// Regla: 8.000 km/mes incluidos (config_reglas); el exceso se cobra a $2 por
// cada bloque de 10 km. Corre el día 1 del mes siguiente (cron) sobre el mes
// cerrado. Idempotente: no duplica cargo 122 del mismo contrato/mes.
//
// Fuente de km: suma de `gps_dias.km` del mes. Sin datos GPS → no se cobra.

import { createServerSupabase } from "@/lib/supabase/server";
import { sendTemplate } from "@/lib/whatsapp/client";
import { espejarEnChat } from "./pipeline";
import { calcularExcesoKm } from "./rules";
import type { ConfigReglas } from "./types";
import { finMes, hoyPanama, inicioMes, mesLargo, sumarDias } from "./fecha";
import { normalizarTelefono } from "./telefono";
import { money } from "./estado-cuenta";

const CONCEPT_CODIGO = "122";
const CONCEPT_NOMBRE = "Exceso de Kilometraje";
const TEMPLATE = "exceso_kilometraje";

const CFG_DEFAULT: ConfigReglas = {
  hora_cierre: "12:00",
  hora_limite_pago: "19:00",
  multa_tarde: 5,
  pago_minimo_diario: 5,
  pago_minimo_domingo: 30,
  km_incluido_mes: 8000,
  exceso_km_costo: 2,
  exceso_km_bloque: 10,
};

export type CargoExcesoKm = {
  contratoId: string;
  vehiculoId: string;
  carro: string;
  clienteNombre: string;
  waNumero: string | null;
  kmMes: number;
  kmExceso: number;
  monto: number;
  cargoId: string | null;
  notificado: boolean;
};

export type ResultadoExcesoKm = {
  mes: string; // YYYY-MM
  mesIni: string;
  mesFin: string;
  limiteKm: number;
  revisados: number;
  conExceso: number;
  cargosCreados: number;
  yaTenian: number;
  sinGps: number;
  notificados: number;
  fallosWa: number;
  detalle: CargoExcesoKm[];
};

/** Una fecha cualquiera del mes anterior a `hoy` (YYYY-MM-DD). */
export function fechaEnMesAnterior(hoy = hoyPanama()): string {
  const ini = inicioMes(hoy);
  return sumarDias(ini, -1); // último día del mes previo
}

async function cargarConfig(): Promise<ConfigReglas> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("config_reglas")
    .select(
      "hora_cierre, hora_limite_pago, multa_tarde, pago_minimo_diario, pago_minimo_domingo, km_incluido_mes, exceso_km_costo, exceso_km_bloque",
    )
    .is("empresa_id", null)
    .limit(1)
    .maybeSingle();
  if (!data) return { ...CFG_DEFAULT };
  const row = data as Partial<ConfigReglas>;
  return {
    hora_cierre: row.hora_cierre ?? CFG_DEFAULT.hora_cierre,
    hora_limite_pago: row.hora_limite_pago ?? CFG_DEFAULT.hora_limite_pago,
    multa_tarde: Number(row.multa_tarde ?? CFG_DEFAULT.multa_tarde),
    pago_minimo_diario: Number(row.pago_minimo_diario ?? CFG_DEFAULT.pago_minimo_diario),
    pago_minimo_domingo: Number(row.pago_minimo_domingo ?? CFG_DEFAULT.pago_minimo_domingo),
    km_incluido_mes: Number(row.km_incluido_mes ?? CFG_DEFAULT.km_incluido_mes),
    exceso_km_costo: Number(row.exceso_km_costo ?? CFG_DEFAULT.exceso_km_costo),
    exceso_km_bloque: Number(row.exceso_km_bloque ?? CFG_DEFAULT.exceso_km_bloque),
  };
}

function componentesTemplate(vars: string[]) {
  return [{ type: "body", parameters: vars.map((text) => ({ type: "text", text })) }];
}

/**
 * Liquida el exceso de km del mes indicado.
 * @param mesRef cualquier fecha YYYY-MM-DD dentro del mes a liquidar
 *               (default: mes calendario anterior a hoy).
 * @param opts.notificar si false, solo crea cargos (útil para dry-run parcial).
 */
export async function liquidarExcesoKmMes(
  mesRef = fechaEnMesAnterior(),
  opts: { notificar?: boolean } = {},
): Promise<ResultadoExcesoKm> {
  const notificar = opts.notificar !== false;
  const mesIni = inicioMes(mesRef);
  const mesFin = finMes(mesRef);
  const mes = mesIni.slice(0, 7);
  const cfg = await cargarConfig();
  const sb = createServerSupabase();

  const res: ResultadoExcesoKm = {
    mes,
    mesIni,
    mesFin,
    limiteKm: cfg.km_incluido_mes,
    revisados: 0,
    conExceso: 0,
    cargosCreados: 0,
    yaTenian: 0,
    sinGps: 0,
    notificados: 0,
    fallosWa: 0,
    detalle: [],
  };

  const [contratosRes, kmRes, cargosRes] = await Promise.all([
    sb
      .from("contratos")
      .select(
        "id, vehiculo_id, cliente:clientes(nombre, whatsapp), vehiculo:vehiculos(id, numero)",
      )
      .eq("estado", "activo")
      .not("vehiculo_id", "is", null),
    sb
      .from("gps_dias")
      .select("vehiculo_id, km")
      .gte("fecha", mesIni)
      .lte("fecha", mesFin)
      .not("vehiculo_id", "is", null),
    sb
      .from("cargos")
      .select("contrato_id")
      .eq("concepto_codigo", CONCEPT_CODIGO)
      .gte("fecha", mesIni)
      .lte("fecha", mesFin),
  ]);

  if (contratosRes.error) throw contratosRes.error;
  if (kmRes.error) throw kmRes.error;

  type ContratoRow = {
    id: string;
    vehiculo_id: string;
    cliente: { nombre: string; whatsapp: string | null } | null;
    vehiculo: { id: string; numero: string } | null;
  };

  const kmPorVehiculo = new Map<string, number>();
  for (const r of (kmRes.data ?? []) as { vehiculo_id: string; km: number | null }[]) {
    kmPorVehiculo.set(
      r.vehiculo_id,
      (kmPorVehiculo.get(r.vehiculo_id) ?? 0) + Number(r.km ?? 0),
    );
  }

  const yaCargados = new Set(
    ((cargosRes.data ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const contratos = (contratosRes.data ?? []) as unknown as ContratoRow[];
  res.revisados = contratos.length;
  const etiquetaMes = mesLargo(mesIni); // "septiembre 2026"

  for (const c of contratos) {
    const vehId = c.vehiculo_id;
    if (!vehId || !c.vehiculo) continue;
    if (!kmPorVehiculo.has(vehId)) {
      res.sinGps++;
      continue;
    }
    const kmMes = Math.round((kmPorVehiculo.get(vehId) ?? 0) * 10) / 10;
    const monto = calcularExcesoKm(kmMes, cfg);
    if (monto <= 0.009) continue;

    res.conExceso++;
    const kmExceso = Math.max(0, kmMes - cfg.km_incluido_mes);
    const nombre = c.cliente?.nombre?.split(" ")[0] ?? "cliente";
    const carro = c.vehiculo.numero;
    const item: CargoExcesoKm = {
      contratoId: c.id,
      vehiculoId: vehId,
      carro,
      clienteNombre: c.cliente?.nombre ?? nombre,
      waNumero: c.cliente?.whatsapp ?? null,
      kmMes,
      kmExceso,
      monto,
      cargoId: null,
      notificado: false,
    };

    if (yaCargados.has(c.id)) {
      res.yaTenian++;
      res.detalle.push(item);
      continue;
    }

    const { data: cargo, error } = await sb
      .from("cargos")
      .insert({
        contrato_id: c.id,
        fecha: mesFin,
        tipo: "exceso_km",
        concepto_codigo: CONCEPT_CODIGO,
        concepto: `${CONCEPT_NOMBRE} (${etiquetaMes}: ${Math.round(kmMes)} km)`,
        monto,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[exceso-km] no pude crear cargo", c.id, error.message);
      res.detalle.push(item);
      continue;
    }

    item.cargoId = (cargo as { id: string } | null)?.id ?? null;
    res.cargosCreados++;
    yaCargados.add(c.id);

    if (notificar) {
      const to = normalizarTelefono(item.waNumero);
      if (to) {
        try {
          const kmTxt = String(Math.round(kmMes));
          const limiteTxt = String(cfg.km_incluido_mes);
          const excesoTxt = String(Math.round(kmExceso));
          const montoTxt = money(monto);
          await sendTemplate(
            to,
            TEMPLATE,
            "es",
            componentesTemplate([
              nombre,
              carro,
              kmTxt,
              etiquetaMes,
              limiteTxt,
              excesoTxt,
              montoTxt,
            ]),
          );
          await espejarEnChat(
            to,
            `Hola ${nombre}, su carro ${carro} recorrió ${kmTxt} km en ${etiquetaMes} (límite ${limiteTxt} km). El exceso es de ${excesoTxt} km y se cargó ${montoTxt} a su cuenta. Quedamos atentos.`,
          );
          item.notificado = true;
          res.notificados++;
        } catch (e) {
          res.fallosWa++;
          console.error(
            "[exceso-km] WA falló",
            carro,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }

    res.detalle.push(item);
  }

  return res;
}
