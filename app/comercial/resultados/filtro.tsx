"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FiltersBar } from "@/components/kit";
import type { PeriodoResultados } from "@/lib/comercial/resultados";

const CHIPS: { id: PeriodoResultados; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "mes", label: "Mes en curso" },
  { id: "mes_ant", label: "Mes anterior" },
  { id: "rango", label: "Desde / hasta" },
];

export function FiltroResultados({
  periodo,
  desde,
  hasta,
  etiqueta,
}: {
  periodo: PeriodoResultados;
  desde: string;
  hasta: string;
  etiqueta: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [desdeLocal, setDesdeLocal] = useState(desde);
  const [hastaLocal, setHastaLocal] = useState(hasta);

  useEffect(() => {
    setDesdeLocal(desde);
    setHastaLocal(hasta);
  }, [desde, hasta]);

  const ir = (next: PeriodoResultados, d = desdeLocal, h = hastaLocal) => {
    const params = new URLSearchParams();
    params.set("periodo", next);
    if (next === "rango") {
      params.set("desde", d);
      params.set("hasta", h);
    }
    startTransition(() => {
      router.push(`/comercial/resultados?${params.toString()}`);
    });
  };

  return (
    <div className="mt-6 space-y-3">
      <FiltersBar
        chips={CHIPS}
        activeChip={periodo}
        onChip={(id) => ir(id as PeriodoResultados)}
        actions={
          <p className="text-sm tabular-nums text-muted">
            {pending ? "Cargando…" : etiqueta}
          </p>
        }
      />

      {periodo === "rango" && (
        <form
          className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!desdeLocal || !hastaLocal) return;
            ir("rango", desdeLocal, hastaLocal);
          }}
        >
          <label className="min-w-0 flex-1 sm:max-w-[11rem]">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Desde
            </span>
            <input
              type="date"
              required
              value={desdeLocal}
              max={hastaLocal || undefined}
              onChange={(e) => setDesdeLocal(e.target.value)}
              className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <label className="min-w-0 flex-1 sm:max-w-[11rem]">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Hasta
            </span>
            <input
              type="date"
              required
              value={hastaLocal}
              min={desdeLocal || undefined}
              onChange={(e) => setHastaLocal(e.target.value)}
              className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !desdeLocal || !hastaLocal}
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
