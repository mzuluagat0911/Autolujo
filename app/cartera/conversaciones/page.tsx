import { InboxConversaciones } from "./inbox";
import { cargarBandeja } from "./actions";
import { demoBandeja, demoDetalle } from "./demo-data";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const esDemo = demo === "1";

  if (esDemo) {
    const { convs } = demoBandeja();
    return (
      <InboxConversaciones
        demo
        inicial={convs}
        seleccionInicial={demoDetalle("demo-144")}
      />
    );
  }

  const { convs, error } = await cargarBandeja();
  return (
    <InboxConversaciones
      inicial={convs}
      errorInicial={error}
      seleccionInicial={null}
    />
  );
}
