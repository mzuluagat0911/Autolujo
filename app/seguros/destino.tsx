"use client";

import type { DestinoCarro } from "@/lib/seguros/modelo";

export function DestinoCarroOpciones({
  valor,
  onChange,
}: {
  valor: DestinoCarro;
  onChange: (v: Exclude<DestinoCarro, "">) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Dónde está el carro</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Opcion
          activo={valor === "circulando"}
          titulo="Sigue circulando"
          texto="El cliente lo sigue usando. El cobro de la letra no se corta."
          onClick={() => onChange("circulando")}
        />
        <Opcion
          activo={valor === "taller"}
          titulo="Queda en taller"
          texto="El carro no rueda. Se pausa la letra desde la fecha del choque."
          onClick={() => onChange("taller")}
        />
      </div>
    </fieldset>
  );
}

function Opcion({
  activo,
  titulo,
  texto,
  onClick,
}: {
  activo: boolean;
  titulo: string;
  texto: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-xl p-4 text-left ring-1 transition ${
        activo ? "bg-ink text-white ring-ink" : "bg-surface text-ink ring-line hover:ring-line-strong"
      }`}
    >
      <span className="block text-sm font-semibold">{titulo}</span>
      <span className={`mt-1 block text-xs ${activo ? "text-white/75" : "text-muted"}`}>{texto}</span>
    </button>
  );
}
