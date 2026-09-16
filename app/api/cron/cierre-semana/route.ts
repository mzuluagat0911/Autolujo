import { aplicarCierreSemana } from "@/lib/cartera/cierre-semana";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cron de los MARTES a primera hora (antes del estado de cuenta de las 8am):
// cobra $10 a quien no cerró la semana al día (arrastra deuda del lunes o
// antes). Así el recargo sale en el cobro de la mañana. Idempotente por día.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  try {
    const res = await aplicarCierreSemana(hoyPanama());
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/cierre-semana] falló:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
