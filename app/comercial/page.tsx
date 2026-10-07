import { BandejaComercial } from "./bandeja";
import { listarChatsComercial } from "@/lib/comercial/chats";

export const dynamic = "force-dynamic";

export default async function ComercialPage() {
  const { chats, error } = await listarChatsComercial();
  return <BandejaComercial inicial={chats} errorInicial={error} />;
}
