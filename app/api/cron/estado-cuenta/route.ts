import { enviarEstadosCuentaHoy } from "@/lib/cartera/envios";

export const runtime = "nodejs";
export const maxDuration = 300; // hasta 5 min (envío a toda la flota)

// Cron diario (Vercel) — envía el estado de cuenta a las 8am Panamá.
export async function GET(req: Request) {
  // Seguridad: Vercel manda Authorization: Bearer ${CRON_SECRET} si está configurado.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Interruptor de seguridad: NO envía masivamente hasta activarlo en producción.
  if (process.env.ENVIOS_MASIVOS !== "on") {
    return Response.json({
      ok: true,
      enviado: false,
      motivo: "ENVIOS_MASIVOS != 'on' — modo seguro (no se mandó nada).",
    });
  }

  const res = await enviarEstadosCuentaHoy();
  return Response.json({ ok: true, enviado: true, ...res });
}
