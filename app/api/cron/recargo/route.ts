import { aplicarRecargosDelDia } from "@/lib/cartera/devengo";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cron de las 7:05 p.m. Panamá. Ya no crea el recargo: solo el equipo lo carga a mano.
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
