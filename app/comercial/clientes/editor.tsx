"use client";

import { useState, useTransition } from "react";

export type FichaCliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  whatsapp: string | null;
  numeroLicencia: string | null;
  categoria: string | null;
  nacimiento: string | null;
  vence: string | null;
};

function dmy(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function EditorClientes({
  clientes,
  action,
}: {
  clientes: FichaCliente[];
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (clientes.length === 0) {
    return <p className="text-sm text-muted">No hay clientes con ese nombre.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso && <p className="text-sm text-ink">{aviso}</p>}
      {clientes.map((c) => (
        <form
          key={c.id}
          className="grid grid-cols-1 gap-3 rounded-xl bg-surface p-4 ring-1 ring-line sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            start(async () => {
              const r = await action(data);
              setAviso(r.ok ? "Datos guardados." : r.error ?? "No se pudo guardar.");
            });
          }}
        >
          <input type="hidden" name="cliente_id" value={c.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Nombre</span>
            <input name="nombre" defaultValue={c.nombre} required className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Teléfono</span>
            <input name="telefono" defaultValue={c.telefono ?? ""} className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">WhatsApp</span>
            <input name="whatsapp" defaultValue={c.whatsapp ?? ""} className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Nº de licencia</span>
            <input name="numero_licencia" defaultValue={c.numeroLicencia ?? ""} className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Categoría</span>
            <select name="categoria_licencia" defaultValue={c.categoria ?? ""} className="rounded-lg bg-white px-3 py-2 ring-1 ring-line">
              <option value="">Sin categoría</option>
              {["A", "B", "C", "D", "E"].map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Nacimiento</span>
            <input name="fecha_nacimiento" defaultValue={dmy(c.nacimiento)} placeholder="dd/mm/aaaa" className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Vence la licencia</span>
            <input name="fecha_vencimiento_licencia" defaultValue={dmy(c.vence)} placeholder="dd/mm/aaaa" className="rounded-lg bg-white px-3 py-2 ring-1 ring-line" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Guardando…" : "Guardar datos"}
            </button>
          </div>
        </form>
      ))}
    </div>
  );
}
