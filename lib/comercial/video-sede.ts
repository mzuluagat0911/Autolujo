import { createServerSupabase } from "@/lib/supabase/server";
import { sendVideo } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "./entrega";
import { registrarSalidaComercial } from "./chats";
import { sedePorId, type SedeId } from "./sedes";

const ARCHIVO: Record<SedeId, string> = {
  juan_diaz: "comercial/sedes/juan-diaz.mp4",
  chorrera: "comercial/sedes/chorrera.mp4",
};

const UBICACION =
  /ubicaci[oó]n|c[oó]mo (?:puedo |se |hago para )?llegar|d[oó]nde queda|direcci[oó]n|por d[oó]nde/i;

export function pideUbicacion(texto: string): boolean {
  return UBICACION.test(texto);
}

/** Panama si nombran Juan Díaz. Chorrera si la nombran. Si no, la de la cita. Si tampoco, las dos. */
export function sedesParaVideo(texto: string, sedeCita: SedeId | null): SedeId[] {
  const t = texto.toLowerCase();
  const panama = /juan\s*d[ií]az|panam[aá]|candelaria|san fernando/.test(t);
  const chorrera = /chorrera/.test(t);
  if (panama && chorrera) return ["juan_diaz", "chorrera"];
  if (panama) return ["juan_diaz"];
  if (chorrera) return ["chorrera"];
  if (sedeCita) return [sedeCita];
  return ["juan_diaz", "chorrera"];
}

async function enlaceVideo(sede: SedeId): Promise<string> {
  const sb = createServerSupabase();
  const { data, error } = await sb.storage.from("comprobantes").createSignedUrl(ARCHIVO[sede], 60 * 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Sin enlace del video.");
  return data.signedUrl;
}

export async function enviarVideoSede(
  to: string,
  sede: SedeId,
  phoneId: string,
  conversacionId?: string | null,
): Promise<void> {
  const nombre = sedePorId(sede)?.nombre ?? "la sede";
  const link = await enlaceVideo(sede);
  const json = await sendVideo(to, link, `Así se llega a ${nombre}.`, phoneId);
  if (!conversacionId) return;
  await registrarSalidaComercial(conversacionId, `🎥 Video de cómo llegar a ${nombre}.`, {
    autor: "sistema",
    waMessageId: idMensajeEnviado(json),
  });
}
