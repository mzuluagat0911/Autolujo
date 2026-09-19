"use client";

import { useMemo, useState } from "react";
import { FiltersBar, Money, EmptyState } from "@/components/kit";
import {
  CAJAS_CHAPISTERIA,
  CATEGORIA_LABEL,
  ITEMS_CHAPISTERIA,
  TALLERES_EXTERNOS,
  KM_SIN_RECARGO_NUEVA,
  precioChapisteria,
  type CategoriaChapisteria,
  type ItemChapisteria,
} from "@/lib/operaciones/tarifas-chapisteria";

const CATS: { id: CategoriaChapisteria | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "nueva", label: "Nueva" },
  { id: "reparada_leve", label: "Leve" },
  { id: "reparada_fuerte", label: "Fuerte" },
  { id: "rollingboard", label: "Rollingboard" },
];

export function ChapisteriaVista() {
  const [cat, setCat] = useState<CategoriaChapisteria | "todas">("todas");
  const [contado, setContado] = useState(false);
  const [kmAlto, setKmAlto] = useState(false);

  const visibles = useMemo(() => {
    return ITEMS_CHAPISTERIA.filter((i) => cat === "todas" || i.categoria === cat);
  }, [cat]);

  const porCat = useMemo(() => {
    const map = new Map<CategoriaChapisteria, ItemChapisteria[]>();
    for (const i of visibles) {
      const arr = map.get(i.categoria) ?? [];
      arr.push(i);
      map.set(i.categoria, arr);
    }
    return map;
  }, [visibles]);

  return (
    <div className="mt-6 space-y-8">
      <FiltersBar
        chips={CATS.map((c) => ({
          id: c.id,
          label: c.label,
          count: c.id === "todas" ? ITEMS_CHAPISTERIA.length : undefined,
        }))}
        activeChip={cat}
        onChip={(id) => setCat(id as CategoriaChapisteria | "todas")}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setContado((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                contado ? "bg-ink text-white" : "text-muted ring-1 ring-line hover:text-ink"
              }`}
            >
              Contado (−20%)
            </button>
            <button
              type="button"
              onClick={() => setKmAlto((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                kmAlto ? "bg-ink text-white" : "text-muted ring-1 ring-line hover:text-ink"
              }`}
              title={`Aplica +40% solo a pieza nueva si km ≥ ${KM_SIN_RECARGO_NUEVA.toLocaleString("es-PA")}`}
            >
              ≥ {KM_SIN_RECARGO_NUEVA.toLocaleString("es-PA")} km (+40% nuevas)
            </button>
          </div>
        }
      />

      <p className="text-sm text-muted">
        Modelos: <span className="font-medium text-ink">Hyundai Grand i10</span> y{" "}
        <span className="font-medium text-ink">Kia Soluto</span>. Precios base a crédito. El
        descuento de contado no aplica a pieza nueva; el recargo por km alto solo a pieza nueva.
      </p>

      {visibles.length === 0 ? (
        <EmptyState title="Sin ítems" hint="Cambiá el filtro de categoría." />
      ) : (
        [...porCat.entries()].map(([c, items]) => (
          <section key={c}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {CATEGORIA_LABEL[c]}
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                    <th className="px-4 py-3 font-medium">Pieza / trabajo</th>
                    <th className="px-4 py-3 font-medium text-right">Unitario</th>
                    <th className="px-4 py-3 font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const { unitario, nota } = precioChapisteria(i, {
                      contado,
                      km: kmAlto ? KM_SIN_RECARGO_NUEVA : 0,
                    });
                    return (
                      <tr key={i.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-3 font-medium">{i.pieza}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <Money amount={unitario} />
                        </td>
                        <td className="px-4 py-3 text-muted">{nota}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Presupuesto por cajas
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {CAJAS_CHAPISTERIA.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  Caja {c.id}{" "}
                  <span className="text-muted">· {c.periodo}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  <Money amount={c.presupuesto} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Total mes ≈{" "}
            <Money amount={CAJAS_CHAPISTERIA.reduce((s, c) => s + c.presupuesto, 0)} /> ·
            reparaciones leves / flujo de flota.
          </p>
        </div>

        <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Talleres externos
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {TALLERES_EXTERNOS.map((t) => (
              <li key={t} className="font-medium text-ink">
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Programar: vehículo, trabajo, piezas, costo, días fuera, taller y caja del mes.
          </p>
        </div>
      </section>
    </div>
  );
}
