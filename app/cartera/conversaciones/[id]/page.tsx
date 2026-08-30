import { InboxConversaciones } from "../inbox";
import { accionMarcarLeida, cargarBandeja, cargarDetalle } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConversacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ convs, error }, { detalle }] = await Promise.all([
    cargarBandeja(),
    cargarDetalle(id),
  ]);

  // Marcar leída en el servidor al abrir por URL directa / deep link.
  if (detalle) {
    try {
      await accionMarcarLeida(id);
    } catch {
      /* ignore */
    }
  }

  return (
    <InboxConversaciones
      inicial={convs.map((c) => (c.id === id ? { ...c, no_leidos: 0 } : c))}
      errorInicial={error}
      seleccionInicial={detalle}
    />
  );
}
