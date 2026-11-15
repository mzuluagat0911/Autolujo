import {
  auditarComprobantesHoy,
  limpiarDuplicadosHoy,
} from "@/lib/cartera/auditar-comprobantes-hoy";

export const runtime = "nodejs";
export const maxDuration = 120;

/** ?limpiar=1 rechaza duplicados claros (misma foto / mismos datos). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const url = new URL(req.url);
    const limpiar = url.searchParams.get("limpiar") === "1";
    const audit = await auditarComprobantesHoy();
    if (!limpiar) return Response.json({ ok: true, ...audit });
    const limpia = await limpiarDuplicadosHoy();
    const despues = await auditarComprobantesHoy();
    return Response.json({ ok: true, antes: audit, limpia, despues });
  } catch (e) {
    console.error("[cron/auditar-comprobantes-hoy] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
