import { enviarCobroExClientes } from "@/lib/cartera/ex-clientes-cobro";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lun–sáb 9:00 a.m. Panamá. El domingo no corre. El feriado sale en cero.
// No manda nada antes del lunes 16 de noviembre de 2026.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const res = await enviarCobroExClientes(hoyPanama());
    return Response.json(res);
  } catch (e) {
    console.error("[cron/ex-clientes] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
