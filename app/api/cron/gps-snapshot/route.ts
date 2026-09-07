import { revisarGpsDelDia } from "@/lib/gps/revisar-dia";
import { slotSnapshotActual } from "@/lib/gps/snapshot-slots";

export const runtime = "nodejs";
export const maxDuration = 300;

// Snapshot del día (mañana / tarde / noche según hora Panamá o ?slot=).
// Hobby: solo la tarde llama a Diacor. Pro: GPS_SNAPSHOT_PRO=on.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const gate = slotSnapshotActual(req.url);
  if (!gate.ok) {
    return Response.json({ ok: true, enviado: false, slot: gate.slot, motivo: gate.motivo });
  }
  if (!process.env.DIACOR_USER || !process.env.DIACOR_PASSWORD) {
    return Response.json({ ok: true, enviado: false, slot: gate.slot, motivo: "Diacor no configurado." });
  }
  const res = await revisarGpsDelDia(undefined, { alertarParado: false });
  return Response.json({ ok: true, slot: gate.slot, ...res });
}
