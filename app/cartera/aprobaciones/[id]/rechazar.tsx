"use client";

import { useState, useTransition } from "react";
import { rechazarSolicitudContrato } from "../actions";

export function RechazarSolicitud({ solicitudId }: { solicitudId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash"
      >
        Rechazar solicitud
      </button>
    );
  }

  return (
    <form
      className="flex w-full max-w-md flex-col gap-2 rounded-xl bg-surface p-4 ring-1 ring-line"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr(null);
        start(async () => {
          const r = await rechazarSolicitudContrato(fd);
          if (!r.ok) {
            setErr(r.error ?? "No se pudo rechazar.");
            return;
          }
          window.location.assign(r.redirectTo ?? "/cartera/aprobaciones");
        });
      }}
    >
      <input type="hidden" name="solicitud_id" value={solicitudId} />
      <p className="text-sm text-muted">La solicitud queda rechazada. No se crea cliente ni contrato.</p>
      <textarea
        name="motivo_rechazo"
        required
        minLength={3}
        rows={3}
        placeholder="Motivo del rechazo…"
        className="w-full rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Rechazando…" : "Confirmar rechazo"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted ring-1 ring-line hover:bg-surface-2"
        >
          Cancelar
        </button>
      </div>
      {err && <p className="text-sm text-rojo">{err}</p>}
    </form>
  );
}
