"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/kit";
import { pathEmpresa } from "@/lib/seguros/datos";
import { subirDocEmpresa } from "../actions";

export function ListaPublicos({
  empresas,
  urls,
}: {
  empresas: { id: string; codigo: string; nombre: string }[];
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {empresas.map((e) => {
        const path = pathEmpresa(e.id, "registro");
        const url = urls[path];
        return (
          <form
            key={e.id}
            className="rounded-xl bg-surface p-5 ring-1 ring-line"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              fd.set("empresa_id", e.id);
              fd.set("cual", "registro");
              setError(null);
              start(async () => {
                const r = await subirDocEmpresa(fd);
                if (!r.ok) {
                  setError(r.error ?? "No se pudo guardar.");
                  return;
                }
                setAviso(`${e.nombre}: registro actualizado.`);
                router.refresh();
              });
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{e.nombre}</h2>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
                  Ver actual
                </a>
              ) : (
                <span className="text-sm text-muted">Sin archivo</span>
              )}
            </div>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Actualizar</span>
              <input name="archivo" type="file" accept="application/pdf,image/*" required className="text-sm" />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="mt-3 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </form>
        );
      })}
      {error && <p className="text-sm text-rojo">{error}</p>}
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
    </div>
  );
}
