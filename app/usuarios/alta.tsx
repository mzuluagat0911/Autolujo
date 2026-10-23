"use client";

import { useActionState } from "react";
import { Field, SubmitButton } from "@/components/form";
import { MODULOS } from "@/lib/equipo/modulos";
import { crearUsuarioEquipo, type ResultadoUsuario } from "./actions";

export function AltaUsuario() {
  const [r, accion] = useActionState(crearUsuarioEquipo, null as ResultadoUsuario | null);

  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
      <h2 className="text-base font-semibold">Dar un acceso nuevo</h2>
      <p className="mt-1 text-sm text-muted">
        Crea la cuenta y marcá los módulos. Entra en <span className="font-medium text-ink">/ingreso</span>.
      </p>
      <form action={accion} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" required placeholder="Nombre y apellido" autoComplete="name" />
        <Field label="Correo" name="email" type="email" required placeholder="persona@autolujo.com" autoComplete="off" />
        <Field
          label="Clave inicial"
          name="clave"
          type="password"
          required
          minLength={8}
          hint="Mínimo 8 caracteres."
          autoComplete="new-password"
        />
        <fieldset className="sm:col-span-2">
          <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Módulos</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODULOS.map((m) => (
              <label key={m.id} className="flex items-start gap-2 rounded-lg px-3 py-2 ring-1 ring-line">
                <input type="checkbox" name="modulo" value={m.id} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <SubmitButton>Crear acceso</SubmitButton>
          {r && <p className={`mt-3 text-sm ${r.ok ? "text-verde" : "text-rojo"}`}>{r.msg}</p>}
        </div>
      </form>
    </div>
  );
}
