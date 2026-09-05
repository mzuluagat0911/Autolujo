import { enviarRecordatoriosHoy } from "@/lib/cartera/recordatorios";

export const runtime = "nodejs";
export const maxDuration = 300;

// Reenganche de cierre (antes de las 7pm): último recordatorio del día a quien
// aún no ha pagado. Los que sigan sin pagar quedan en la lista "por llamar"
// (/cartera/por-llamar), que se calcula en vivo.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  if (process.env.ENVIOS_MASIVOS !== "on") {
    return Response.json({ ok: true, enviado: false, motivo: "ENVIOS_MASIVOS != 'on' — modo seguro." });
  }
  const res = await enviarRecordatoriosHoy("cierre");
  return Response.json({ ok: true, enviado: true, ...res });
}
