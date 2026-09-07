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
    <form action={formAccion} className="mt-7 space-y-4">
      {primer && (
        <Field label="Su nombre" name="nombre" required placeholder="Claudia" autoComplete="name" />
      )}
      <Field
        label="Correo"
        name="email"
        type="email"
        required
        placeholder="cobros@autolujo.com"
        autoComplete="username"
      />
      <Field
        label="Clave"
        name="clave"
        type="password"
        required
        minLength={primer ? 8 : undefined}
        placeholder={primer ? "Mínimo 8 caracteres" : "••••••••"}
        autoComplete={primer ? "new-password" : "current-password"}
      />
      <input type="hidden" name="next" value={next} />
      <div className="pt-1">
        <button
          type="submit"
          disabled={pendiente}
          className="w-full rounded-lg bg-ink px-5 py-3 text-sm font-medium text-surface transition hover:bg-black disabled:opacity-50"
        >
          {pendiente ? "Entrando…" : primer ? "Crear administrador" : "Entrar"}
        </button>
      </div>
      {estado && !estado.ok && <p className="text-sm text-rojo">{estado.msg}</p>}
      {primer && (
        <p className="text-xs leading-relaxed text-muted">
          Solo esta vez: quien cree esta cuenta queda como administrador y puede dar accesos al
          equipo.
        </p>
      )}
    </form>
  );
}
