import { aplicarRecargosDelDia } from "@/lib/cartera/devengo";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cron diario — aplica el recargo de las 7:00 p.m. a quien no pagó hoy.
// Corre a las 7:05 p.m. Panamá (00:05 UTC del día siguiente).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const res = await aplicarRecargosDelDia(hoyPanama());
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/recargo] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
