import { PageShell } from "@/components/kit";
import { listarChatsMantenimiento } from "@/lib/operaciones/chats";
import { BandejaMantenimiento } from "./bandeja";

export const dynamic = "force-dynamic";

export default async function ConversacionesMantenimientoPage() {
  const { chats, error } = await listarChatsMantenimiento();
  return (
    <PageShell>
      <BandejaMantenimiento inicial={chats} errorInicial={error} />
    </PageShell>
  );
}
