"use client";

import { useActionState } from "react";
import { crearPrimerAdmin, entrar, type ResultadoIngreso } from "./actions";
import { Field } from "@/components/form";

export function FormularioIngreso({
  primer,
  next,
}: {
  primer: boolean;
  next: string;
}) {
  const accion = primer ? crearPrimerAdmin : entrar;
  const [estado, formAccion, pendiente] = useActionState<ResultadoIngreso | null, FormData>(
    accion,
    null,
  );

  return (
    <form action={formAccion} className="mt-8 space-y-4">
      {primer && <Field label="Su nombre" name="nombre" required placeholder="Claudia" />}
      <Field label="Correo" name="email" type="email" required placeholder="cobros@autolujo.com" />
      <Field label="Clave" name="clave" type="password" required placeholder={primer ? "Mínimo 8 caracteres" : ""} />
      <input type="hidden" name="next" value={next} />
      <div className="pt-2">
        <button
          type="submit"
          disabled={pendiente}
          className="w-full rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-surface transition hover:bg-black disabled:opacity-50"
        >
          {pendiente ? "Entrando…" : primer ? "Crear primer acceso" : "Entrar"}
        </button>
      </div>
      {estado && !estado.ok && <p className="text-sm text-rojo">{estado.msg}</p>}
      {primer && (
        <p className="text-xs text-muted">
          Solo esta vez: el primero que entre queda como administrador y puede dar de alta al resto del equipo.
        </p>
      )}
    </form>
  );
}
