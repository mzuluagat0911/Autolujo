import { cargarKmRango } from "@/lib/gps/cargar-km-rango";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Carga km históricos vía Diacor recorrido.
 * GET /api/cron/gps-backfill?desde=2026-09-01&hasta=2026-09-07
 * Sin params: del 1 del mes (Panamá) hasta hoy.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.DIACOR_USER || !process.env.DIACOR_PASSWORD) {
    return Response.json({ ok: false, error: "Diacor no configurado." }, { status: 503 });
  }

  const url = new URL(req.url);
  const hoy = hoyPanama();
  const desde = url.searchParams.get("desde")?.trim() || `${hoy.slice(0, 7)}-01`;
  const hasta = url.searchParams.get("hasta")?.trim() || hoy;

  try {
    const res = await cargarKmRango(desde, hasta);
    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error cargando km." },
      { status: 500 },
    );
  }
}
