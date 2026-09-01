import { devengarPendientes } from "@/lib/cartera/devengo";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cron diario — carga la cuota del día a cada contrato activo.
// Debe correr ANTES del estado de cuenta: ese mensaje lee el saldo ya devengado.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const res = await devengarPendientes();
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("[cron/devengo] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
