"use client";

import { useActionState } from "react";
import { Field, Select, SubmitButton } from "@/components/form";
import { crearUsuarioEquipo, type ResultadoUsuario } from "./actions";

export function AltaUsuario() {
  const [r, accion] = useActionState(crearUsuarioEquipo, null as ResultadoUsuario | null);

  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
      <h2 className="text-base font-semibold">Dar de alta</h2>
      <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" required />
        <Field label="Correo" name="email" type="email" required />
        <Field
          label="Clave inicial"
          name="clave"
          type="password"
          required
          minLength={8}
          hint="Mínimo 8. Pídale que la cambie después si quiere."
        />
        <Select
          label="Rol"
          name="rol"
          defaultValue="cartera"
          options={[
            { value: "cartera", label: "Cartera — dashboard, pagos, GPS, conversaciones" },
            { value: "admin", label: "Admin — lo anterior + usuarios" },
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
