import { informeSemana } from "@/lib/operaciones/informe-semana";

export const runtime = "nodejs";
export const maxDuration = 60;

// Viernes 1:00 p.m. de Panamá. Arma el informe de la semana siguiente.
// El aviso WhatsApp al cliente es otro cron (sábado), cuando haya plantillas.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const informe = await informeSemana();
    const rev =
      informe.revision === "sin_fecha" ? "sin_fecha" : informe.revision.length;
    return Response.json({
      ok: true,
      semanaDesde: informe.semanaDesde,
      semanaHasta: informe.semanaHasta,
      mantenimiento: informe.mantenimiento.length,
      kit: informe.kit.length,
      atf: informe.atf.length,
      revision: rev,
      avisoCliente: "pendiente_plantillas",
    });
  } catch (e) {
    console.error("[cron/informe-mantenimiento] falló:", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
