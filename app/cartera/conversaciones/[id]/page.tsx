import { InboxConversaciones } from "../inbox";
import { accionMarcarLeida, cargarBandeja, cargarDetalle } from "../actions";
import { demoBandeja, demoDetalle } from "../demo-data";

export const dynamic = "force-dynamic";

export default async function ConversacionDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { id } = await params;
  const { demo } = await searchParams;
  const esDemo = demo === "1";

  if (esDemo) {
    const { convs } = demoBandeja();
    const detalle = demoDetalle(id);
    return (
      <InboxConversaciones
        demo
        inicial={convs.map((c) => (c.id === id ? { ...c, no_leidos: 0 } : c))}
        seleccionInicial={detalle}
      />
    );
  }

  const [{ convs, error }, { detalle }] = await Promise.all([
    cargarBandeja(),
    cargarDetalle(id),
  ]);

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
