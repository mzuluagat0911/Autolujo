import { recuperarComprobantesHuerfanos } from "@/lib/cartera/comprobantes-huerfanos";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cada 10 min: fotos que quedaron en el chat sin fila en Comprobantes
// (candado de lectura vencido / Meta dejó de reintentar).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const res = await recuperarComprobantesHuerfanos(10);
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/comprobantes-huerfanos] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
