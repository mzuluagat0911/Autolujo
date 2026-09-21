"use client";

import { useMemo, useState } from "react";
import { Money } from "@/components/kit";
import { TARIFAS_MECANICA, VEHICULO_TARIFA_MECANICA } from "@/lib/operaciones/tarifas-mecanica";

export function TarifarioMecanicaVista() {
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return TARIFAS_MECANICA;
    return TARIFAS_MECANICA.filter((i) => i.concepto.toLowerCase().includes(t));
  }, [q]);

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar servicio (ej. amortiguador, clutch, frenos…)"
          className="w-full max-w-sm rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
        <p className="text-xs text-muted">
          {VEHICULO_TARIFA_MECANICA} · {filtradas.length} servicio{filtradas.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
              <th className="px-4 py-3 font-medium">Servicio</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">Costo interno</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((i, idx) => (
              <tr key={idx} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2.5">{i.concepto}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {i.precio != null ? <Money amount={i.precio} /> : <span className="text-faint">a confirmar</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                  {i.edison != null ? <Money amount={i.edison} /> : "—"}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">Sin resultados para “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        "Costo interno" es la mano de obra del mecánico (referencia interna). El agente de WhatsApp no cotiza estos montos al cliente.
      </p>
    </div>
  );
}
