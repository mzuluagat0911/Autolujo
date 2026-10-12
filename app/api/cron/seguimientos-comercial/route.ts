import { enviarAvisosCitas } from "@/lib/comercial/citas";
import { ejecutarSeguimientosComercial } from "@/lib/comercial/seguimientos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const [seguimientos, citas] = await Promise.all([
    ejecutarSeguimientosComercial(),
    enviarAvisosCitas(),
  ]);
  return Response.json({ ok: true, seguimientos, citas });
}
