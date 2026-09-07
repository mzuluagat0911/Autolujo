import { revisarGpsDelDia } from "@/lib/gps/revisar-dia";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cierre del día en Panamá (~11 p.m.): exceso de 350 km y carros sin recorrido.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.DIACOR_USER || !process.env.DIACOR_PASSWORD) {
    return Response.json({ ok: true, enviado: false, motivo: "Diacor no configurado." });
  }
  const res = await revisarGpsDelDia();
  return Response.json({ ok: true, ...res });
}
