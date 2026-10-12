import { enviarAvisosCitas } from "@/lib/comercial/citas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 8:00 a.m. Panamá: recordatorio del día. La confirmación de 24 h también
// se revisa cada 15 minutos desde el cron de seguimientos.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const res = await enviarAvisosCitas();
  return Response.json({ ok: true, ...res });
}
