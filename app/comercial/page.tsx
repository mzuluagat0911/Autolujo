import { BandejaCrmComercial } from "./bandeja-crm";
import {
  hiloComercial,
  listarAsesoresComerciales,
  listarChatsComercial,
} from "@/lib/comercial/chats";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { resumenPiloto } from "@/lib/comercial/piloto";

export const dynamic = "force-dynamic";

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const query = await searchParams;
  const sesion = await sesionEquipo();
  const [{ chats, error, siguienteCursor, crmDisponible, conteos }, asesores] = await Promise.all([
    listarChatsComercial({ filtro: "hoy", asesorId: sesion?.id }),
    listarAsesoresComerciales(),
  ]);
  let chatsIniciales = chats;
  if (query.chat && !chats.some((c) => c.id === query.chat)) {
    const abierto = await hiloComercial(query.chat, { limite: 1 });
    if (abierto.chat) chatsIniciales = [abierto.chat, ...chats];
  }
  return (
    <BandejaCrmComercial
      inicial={chatsIniciales}
      errorInicial={error}
      cursorInicial={siguienteCursor}
      crmDisponible={crmDisponible}
      conteosIniciales={conteos}
      sesion={sesion}
      asesores={asesores}
      seleccionadoInicial={query.chat ?? null}
      piloto={resumenPiloto().etiqueta}
    />
  );
}
