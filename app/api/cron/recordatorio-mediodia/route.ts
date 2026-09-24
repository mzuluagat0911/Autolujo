import { enviarRecordatoriosHoy } from "@/lib/cartera/recordatorios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Reenganche 1:00 p.m.: solo quien debe MÁS DE UNA cuota y aún no ha pagado.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  if (process.env.ENVIOS_MASIVOS !== "on") {
    return Response.json({ ok: true, enviado: false, motivo: "ENVIOS_MASIVOS != 'on' — modo seguro." });
  }
  const res = await enviarRecordatoriosHoy("mediodia");
  return Response.json({ ok: true, enviado: true, ...res });
}
