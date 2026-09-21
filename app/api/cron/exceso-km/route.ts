import { fechaEnMesAnterior, liquidarExcesoKmMes } from "@/lib/cartera/exceso-km";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron mensual — día 1 a las 8:00 a.m. Panamá (13:00 UTC).
 * Liquida el exceso de km del mes anterior (código 122) y notifica por WA.
 *
 * Query opcional: ?mes=2026-08 (liquida ese mes YYYY-MM).
 * Query opcional: ?sin_wa=1 (solo crea cargos, no manda plantilla).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const url = new URL(req.url);
    const mesParam = url.searchParams.get("mes"); // YYYY-MM
    const sinWa = url.searchParams.get("sin_wa") === "1";
    const mesRef = mesParam && /^\d{4}-\d{2}$/.test(mesParam)
      ? `${mesParam}-15`
      : fechaEnMesAnterior(hoyPanama());

    const res = await liquidarExcesoKmMes(mesRef, { notificar: !sinWa });
    return Response.json({
      ok: true,
      ...res,
      // No volcamos todo el detalle a la respuesta del cron (puede ser grande).
      detalle: res.detalle.map((d) => ({
        carro: d.carro,
        kmMes: d.kmMes,
        kmExceso: d.kmExceso,
        monto: d.monto,
        creado: Boolean(d.cargoId),
        notificado: d.notificado,
      })),
    });
  } catch (e) {
    console.error("[cron/exceso-km] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
