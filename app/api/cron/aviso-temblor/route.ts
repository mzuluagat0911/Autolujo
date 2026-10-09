import { enviarAvisoTemblor } from "@/lib/cartera/aviso-temblor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 10 de octubre de 2026, 8:00 a.m. Panamá. Reintenta 8:30 y 9:00 si Meta aún no aprobó.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const res = await enviarAvisoTemblor();
  return Response.json({ ok: true, ...res });
}
