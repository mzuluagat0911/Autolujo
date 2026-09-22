"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/form";
import { guardarAlcanceCartera, type ResultadoAlcance } from "./actions";
import { siglaEmpresa } from "@/lib/cartera/empresa";

type Empresa = { id: string; codigo: string; nombre: string };

export function FormAlcance({
  empresas,
  seleccionadas,
}: {
  empresas: Empresa[];
  /** IDs actualmente en alcance; vacío = todas */
  seleccionadas: string[];
}) {
  const pilotoInicial = seleccionadas.length > 0;
  const [modo, setModo] = useState<"todas" | "piloto">(pilotoInicial ? "piloto" : "todas");
  const [r, accion] = useActionState(guardarAlcanceCartera, null as ResultadoAlcance | null);

  return (
    <form action={accion} className="rounded-xl bg-surface p-6 ring-1 ring-line">
      <h2 className="text-base font-semibold">Empresas en operación</h2>
      <p className="mt-1 text-sm text-muted">
        Define qué empresas entran al panel de cartera y a los envíos del día (8am,
        recordatorios, cierre). El rastreo GPS no se filtra.
      </p>

      <input type="hidden" name="modo" value={modo} />

      <div className="mt-5 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 ring-1 ring-line hover:bg-surface-2">
          <input
            type="radio"
            name="modo_ui"
            checked={modo === "todas"}
            onChange={() => setModo("todas")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Todas las empresas</span>
            <span className="mt-0.5 block text-xs text-muted">
              Sin filtro. Panel y crons cubren Autolujo, Kowua y Gold.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 ring-1 ring-line hover:bg-surface-2">
          <input
            type="radio"
            name="modo_ui"
            checked={modo === "piloto"}
            onChange={() => setModo("piloto")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Solo estas (piloto)</span>
            <span className="mt-0.5 block text-xs text-muted">
              Ideal para arrancar por empresa (ej. solo Gold) y sumar la siguiente semana.
            </span>
          </span>
        </label>
      </div>

      {modo === "piloto" && (
        <ul className="mt-4 space-y-2 border-t border-line pt-4">
          {empresas.map((e) => {
            const checked = seleccionadas.includes(e.id);
            return (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    name="empresa_id"
                    value={e.id}
                    defaultChecked={checked}
                    className="size-4"
                  />
                  <span className="text-sm font-medium tabular-nums">
                    {siglaEmpresa(e.codigo)}
                  </span>
                  <span className="text-sm text-muted">{e.nombre}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">{e.codigo}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SubmitButton>Guardar alcance</SubmitButton>
        {r && (
          <p className={`text-sm ${r.ok ? "text-verde" : "text-rojo"}`}>{r.msg}</p>
        )}
      </div>
    </form>
  );
}
