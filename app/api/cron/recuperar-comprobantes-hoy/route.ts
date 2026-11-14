import { recuperarComprobantesDeHoy } from "@/lib/cartera/recuperar-comprobantes-hoy";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Recupera los comprobantes de hoy sin visión (crédito OpenRouter).
 * Crea filas pendientes desde fotos del chat y repone rechazados del día.
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
    const res = await recuperarComprobantesDeHoy();
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/recuperar-comprobantes-hoy] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
