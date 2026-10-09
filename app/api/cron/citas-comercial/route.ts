import { enviarAvisosCitas } from "@/lib/comercial/citas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 7:00 a.m. Panamá: aviso el día antes y, el mismo día, el enlace de la sede.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const res = await enviarAvisosCitas();
  return Response.json({ ok: true, ...res });
}
