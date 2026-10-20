export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apagado el 20 oct 2026. Cada plantilla de las 1:00 p.m. se cobraba aparte.
// El extracto de las 9:00 a.m. y el último aviso de las 5:30 p.m. siguen.
export async function GET() {
  return Response.json({
    ok: true,
    enviado: false,
    motivo: "El recordatorio de la 1:00 p.m. está apagado.",
  });
}
