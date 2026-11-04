import { sendVideo } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "./entrega";
import { registrarSalidaComercial } from "./chats";
import { sedePorId, type SedeId } from "./sedes";

const PUBLICO: Record<SedeId, string> = {
  juan_diaz: "/sedes/juan-diaz.mp4",
  chorrera: "/sedes/chorrera.mp4",
};

function origenVideoPublico(): string {
  const raw = process.env.VIDEO_SEDE_PUBLIC_ORIGIN?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;
  return "https://autolujopanama.com";
}

const UBICACION =
  /ubicaci[oó]n|c[oó]mo (?:puedo |se |hago para )?llegar|d[oó]nde queda|direcci[oó]n|por d[oó]nde/i;

export function pideUbicacion(texto: string): boolean {
  return UBICACION.test(texto);
}

/** Panama si nombran Juan Díaz. Chorrera si la nombran. Si no, la de la cita. Si tampoco, las dos. */
export function sedesParaVideo(texto: string, sedeCita: SedeId | null): SedeId[] {
  const t = texto.toLowerCase();
  const panama = /juan\s*d[ií]a[sz]?|panam[aá]|candelaria|san fernando/.test(t);
  const chorrera = /chorrera/.test(t);
  if (panama && chorrera) return ["juan_diaz", "chorrera"];
  if (panama) return ["juan_diaz"];
  if (chorrera) return ["chorrera"];
  if (sedeCita) return [sedeCita];
  return ["juan_diaz", "chorrera"];
}

async function enlaceVideo(sede: SedeId): Promise<string> {
  return `${origenVideoPublico()}${PUBLICO[sede]}`;
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
