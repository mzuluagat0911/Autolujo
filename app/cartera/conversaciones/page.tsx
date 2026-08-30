import { InboxConversaciones } from "./inbox";
import { cargarBandeja } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage() {
  const { convs, error } = await cargarBandeja();
  return <InboxConversaciones inicial={convs} errorInicial={error} />;
}
