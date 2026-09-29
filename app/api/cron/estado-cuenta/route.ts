import { enviarEstadosCuentaHoy } from "@/lib/cartera/envios";
import { aplicarCierreSemana } from "@/lib/cartera/cierre-semana";
import { hoyPanama } from "@/lib/cartera/fecha";

export const runtime = "nodejs";
export const maxDuration = 300; // hasta 5 min (envío a toda la flota)

// Cron diario (Vercel) — envía el estado de cuenta a las 9am Panamá (lun–dom;
// el domingo solo a quien arrastra deuda o tiene compromiso dominical).
export async function GET(req: Request) {
  // Seguridad: Vercel manda Authorization: Bearer ${CRON_SECRET} si está configurado.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // El martes, a las 9, cobra el $10 a quien sigue con la letra atrasada
  // (el comprobante que se validó antes ya no lo trae).
  try {
    await aplicarCierreSemana(hoyPanama());
  } catch (e) {
    console.error("[cron/estado-cuenta] cierre de semana:", e);
  }

  // Interruptor de seguridad: NO envía masivamente hasta activarlo en producción.
  if (process.env.ENVIOS_MASIVOS !== "on") {
    return Response.json({
      ok: true,
      enviado: false,
      motivo: "ENVIOS_MASIVOS != 'on' — modo seguro (no se mandó nada).",
    });
  }

  const res = await enviarEstadosCuentaHoy();
  return Response.json({ ok: true, enviado: true, ...res });
}
