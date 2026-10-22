"use client";

import { useEffect } from "react";

export function ImprimirRecibo({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, [auto]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        Imprimir recibo
      </button>
      <p className="text-sm text-muted">Elige la impresora de 80 mm. El papel es el de la caja.</p>
    </div>
  );
}
