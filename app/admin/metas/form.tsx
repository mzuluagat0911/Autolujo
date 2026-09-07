"use client";

import { useActionState } from "react";
import { Field, SubmitButton } from "@/components/form";
import { guardarMetaCobranza, type ResultadoMeta } from "./actions";

export function FormMetaMes({
  mesDefault,
  metaDefault,
  notaDefault,
}: {
  mesDefault: string; // YYYY-MM
  metaDefault?: number | null;
  notaDefault?: string | null;
}) {
  const [r, accion] = useActionState(guardarMetaCobranza, null as ResultadoMeta | null);

  return (
    <form action={accion} className="rounded-xl bg-surface p-6 ring-1 ring-line">
      <h2 className="text-base font-semibold">Asignar meta del mes</h2>
      <p className="mt-1 text-sm text-muted">
        Es la Meta al 100% del control de cobranza. El Resumen calcula solo el 95%, el diario y el
        avance ideal.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Mes"
          name="mes"
          type="month"
          required
          defaultValue={mesDefault}
          hint="Un valor por mes; si vuelves a guardar, se actualiza."
        />
        <Field
          label="Meta al 100% (USD)"
          name="meta_100"
          type="number"
          required
          step="0.01"
          min="1"
          defaultValue={metaDefault != null ? String(metaDefault) : undefined}
          placeholder="230625.00"
          hint="Ej. 230625"
        />
        <div className="sm:col-span-2">
          <Field
            label="Nota (opcional)"
            name="nota"
            defaultValue={notaDefault ?? undefined}
            placeholder="2000 Exclientes"
            hint="Texto libre que aparece junto a la meta en el Resumen."
          />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Guardar meta</SubmitButton>
          {r && (
            <p className={`mt-3 text-sm ${r.ok ? "text-verde" : "text-rojo"}`}>{r.msg}</p>
          )}
        </div>
      </div>
    </form>
  );
}
