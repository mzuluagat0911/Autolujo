import { enviarRecordatoriosHoy } from "@/lib/cartera/recordatorios";
import { hoyPanama } from "@/lib/cartera/fecha";

/** Solo este día: no sale el último aviso (5:30 p. m.). El resto del cobro sigue. */
const SIN_ULTIMO_AVISO = "2026-10-09";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
  if (hoyPanama() === SIN_ULTIMO_AVISO) {
    return Response.json({
      ok: true,
      enviado: false,
      motivo: "Hoy no sale el último aviso. El cobro y los demás envíos siguen igual.",
    });
  }
  const res = await enviarRecordatoriosHoy("cierre");
  return Response.json({ ok: true, enviado: true, ...res });
}
