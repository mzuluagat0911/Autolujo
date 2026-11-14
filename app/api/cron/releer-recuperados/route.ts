import { releerPagosRecuperados } from "@/lib/cartera/releer-recuperados";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Rellena monto/datos de pagos recuperados sin lectura (ahora con crédito OpenRouter). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const res = await releerPagosRecuperados(6);
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/releer-recuperados] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
