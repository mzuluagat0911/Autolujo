"use client";

import { useActionState } from "react";
import { Field, Select, SubmitButton } from "@/components/form";
import { crearUsuarioEquipo, type ResultadoUsuario } from "./actions";

export function AltaUsuario() {
  const [r, accion] = useActionState(crearUsuarioEquipo, null as ResultadoUsuario | null);

  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
      <h2 className="text-base font-semibold">1. Dar un acceso nuevo</h2>
      <p className="mt-1 text-sm text-muted">
        Crea la cuenta y entréguele correo + clave. Entra en{" "}
        <span className="font-medium text-ink">/ingreso</span>.
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
          hint="Mínimo 8 caracteres. Pídale que la cambie después si quiere."
          autoComplete="new-password"
        />
        <Select
          label="Rol"
          name="rol"
          defaultValue="cartera"
          options={[
            { value: "cartera", label: "Cartera — panel, pagos, GPS, chats" },
            { value: "admin", label: "Admin — lo anterior + dar accesos" },
          ]}
        />
        <div className="sm:col-span-2">
          <SubmitButton>Crear acceso</SubmitButton>
          {r && (
            <p className={`mt-3 text-sm ${r.ok ? "text-verde" : "text-rojo"}`}>{r.msg}</p>
          )}
        </div>
      </form>
    </div>
  );
}
