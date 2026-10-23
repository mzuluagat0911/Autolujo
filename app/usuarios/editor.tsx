"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MODULOS, type ModuloId } from "@/lib/equipo/modulos";
import { guardarModulos } from "./actions";

export function EditorModulos({ id, actuales }: { id: string; actuales: ModuloId[] }) {
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [mal, setMal] = useState(false);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.getAll("modulo").length === 0) {
      setMal(true);
      setAviso("Marcá al menos un módulo.");
      return;
    }
    start(async () => {
      const r = await guardarModulos(fd);
      setMal(!r.ok);
      setAviso(r.msg);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-1.5">
        {MODULOS.map((m) => (
          <label
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-lg bg-paper px-2 py-1 text-xs ring-1 ring-line"
          >
            <input type="checkbox" name="modulo" value={m.id} defaultChecked={actuales.includes(m.id)} />
            {m.label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {aviso && <span className={`text-xs ${mal ? "text-rojo" : "text-verde"}`}>{aviso}</span>}
      </div>
    </form>
  );
}
