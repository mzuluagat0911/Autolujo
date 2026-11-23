// Informe que antes armaba Claudia el viernes en la tarde, para la semana siguiente.
// Néstor cita con esta lista. Amalia confirma la asistencia.
// El WhatsApp al cliente del sábado sale de otro cron, con WHATSAPP_MANTENIMIENTO_PHONE_NUMBER_ID.

import { diaSemana, fechaLarga, hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { aceiteAtfKm, kitTiempoKm, mantenimientoKm, type KitTiempoItem, type MantenimientoItem } from "./alertas";

export type InformeSemana = {
  hoy: string;
  semanaDesde: string;
  semanaHasta: string;
  mantenimiento: MantenimientoItem[];
  kit: KitTiempoItem[];
  atf: KitTiempoItem[];
  revision: "sin_fecha";
};

/** Lunes de la semana que cubre el informe. Viernes y sábado apuntan a la que entra. */
function lunesDelInforme(hoy: string): string {
  const dia = diaSemana(hoy);
  const hastaLunes = dia === 0 ? 1 : dia >= 5 ? 8 - dia : 1 - dia;
  return sumarDias(hoy, hastaLunes);
}

export function fechasInforme(ahora = new Date()) {
  const hoy = hoyPanama(ahora);
  const semanaDesde = lunesDelInforme(hoy);
  return { hoy, semanaDesde, semanaHasta: sumarDias(semanaDesde, 5) };
}

export function armarInforme(
  fechas: ReturnType<typeof fechasInforme>,
  mant: MantenimientoItem[],
  kit: KitTiempoItem[],
  atf: KitTiempoItem[],
): InformeSemana {
  return {
    ...fechas,
    mantenimiento: mant.filter((i) => i.estado !== "ok"),
    kit: kit.filter((i) => i.estado !== "ok"),
    atf: atf.filter((i) => i.estado !== "ok"),
    revision: "sin_fecha",
  };
}

export async function informeSemana(ahora = new Date()): Promise<InformeSemana> {
  const [mant, kit, atf] = await Promise.all([mantenimientoKm(), kitTiempoKm(), aceiteAtfKm()]);
  return armarInforme(
    fechasInforme(ahora),
    mant.disponible ? mant.items : [],
    kit.disponible ? kit.items : [],
    atf.disponible ? atf.items : [],
  );
}

export function tituloSemana(informe: Pick<InformeSemana, "semanaDesde" | "semanaHasta">): string {
  return `${fechaLarga(informe.semanaDesde)} – ${fechaLarga(informe.semanaHasta)}`;
}
