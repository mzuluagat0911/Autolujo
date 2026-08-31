"use client";

import { useActionState } from "react";
import { accionEnviarPrueba, type ResultadoPrueba } from "./actions";

export function PruebaEnvio() {
  const [state, action, pending] = useActionState<ResultadoPrueba, FormData>(accionEnviarPrueba, null);

  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-line/60">
      <p className="text-sm font-medium">🧪 Enviar prueba (piloto)</p>
      <p className="mt-1 text-xs text-muted">
        Manda el estado de cuenta de un carro a tu propio WhatsApp para verlo. Deja el número vacío
        para que le llegue al cliente real.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">Carro</label>
          <input name="carro" required placeholder="144" className="mt-1 w-28 rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line/60 focus:outline-none focus:ring-2 focus:ring-ink/20" />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">Número destino (opcional)</label>
          <input name="numero" placeholder="507XXXXXXXX (tu WhatsApp)" className="mt-1 w-56 rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line/60 focus:outline-none focus:ring-2 focus:ring-ink/20" />
        </div>
        <button disabled={pending} className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50">
          {pending ? "Enviando…" : "Enviar prueba"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="mt-3 rounded-lg bg-crit/5 px-3 py-2 text-xs text-crit ring-1 ring-crit/25">{state.error}</p>
      )}
      {state && state.ok && (
        <div className="mt-3 rounded-lg bg-good/5 px-3 py-2 text-xs ring-1 ring-good/25">
          ✅ Enviado. Vista previa:
          <pre className="mt-2 whitespace-pre-wrap font-sans text-muted">{state.preview}</pre>
        </div>
      )}
    </div>
  );
}
