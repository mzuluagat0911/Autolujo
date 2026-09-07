import { revisarGpsDelDia } from "@/lib/gps/revisar-dia";

export const runtime = "nodejs";
export const maxDuration = 300;

// Durante el día: guarda posiciones + km y alerta solo si ya pasó de 350 km.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.DIACOR_USER || !process.env.DIACOR_PASSWORD) {
    return Response.json({ ok: true, enviado: false, motivo: "Diacor no configurado." });
  }
  const res = await revisarGpsDelDia(undefined, { alertarParado: false });
  return Response.json({ ok: true, ...res });
}
