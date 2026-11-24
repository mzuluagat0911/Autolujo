"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ContratoOpt } from "./tipos";

/** Select con buscador para anclar un pago a un contrato o ex cliente (200+). */
export function SelectContrato({
  name,
  contratos,
  defaultValue = "",
  required = false,
}: {
  name: string;
  contratos: ContratoOpt[];
  defaultValue?: string;
  required?: boolean;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [valor, setValor] = useState(defaultValue);

  const elegido = useMemo(
    () => contratos.find((c) => c.id === valor) ?? null,
    [contratos, valor],
  );

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? contratos.filter((c) => c.label.toLowerCase().includes(needle))
      : contratos;
    return {
      activos: base.filter((c) => c.grupo !== "ex" && c.activo),
      inactivos: base.filter((c) => c.grupo !== "ex" && !c.activo),
      ex: base.filter((c) => c.grupo === "ex"),
    };
  }, [contratos, q]);

  useEffect(() => {
    if (!abierto) return;
    buscarRef.current?.focus();
    function fuera(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) {
        setAbierto(false);
        setQ("");
      }
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  function elegir(c: ContratoOpt) {
    setValor(c.id);
    setAbierto(false);
    setQ("");
  }

  const vacioFiltro =
    filtrados.activos.length === 0 &&
    filtrados.inactivos.length === 0 &&
    filtrados.ex.length === 0;

  return (
    <div ref={root} className="w-full min-w-0 max-w-md basis-full">
      {/* No type=hidden: el required de HTML5 no aplica ahí. */}
      <input
        name={name}
        value={valor}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
        onChange={() => {}}
      />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listId}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-left text-sm ring-1 ring-line hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ink/20"
      >
        <span className={elegido ? "truncate text-ink" : "truncate text-muted"}>
          {elegido ? elegido.label : "Anclar a contrato o ex cliente…"}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`shrink-0 text-muted transition ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* En flujo (no absolute): el listado padre usa overflow-hidden y cortaba el panel. */}
      {abierto && (
        <div
          id={listId}
          role="listbox"
          className="mt-1 overflow-hidden rounded-lg bg-surface shadow-lg ring-1 ring-line"
        >
          <div className="border-b border-line p-2">
            <input
              ref={buscarRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar carro, cliente, ex…"
              className="w-full rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {vacioFiltro ? (
              <p className="px-3 py-2 text-sm text-muted">Nadie coincide.</p>
            ) : (
              <>
                {filtrados.activos.length > 0 && (
                  <Grupo
                    titulo="Activos"
                    items={filtrados.activos}
                    valor={valor}
                    onPick={elegir}
                  />
                )}
                {filtrados.inactivos.length > 0 && (
                  <Grupo
                    titulo="Inactivos"
                    items={filtrados.inactivos}
                    valor={valor}
                    onPick={elegir}
                  />
                )}
                {filtrados.ex.length > 0 && (
                  <Grupo
                    titulo="Ex clientes"
                    items={filtrados.ex}
                    valor={valor}
                    onPick={elegir}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  items,
  valor,
  onPick,
}: {
  titulo: string;
  items: ContratoOpt[];
  valor: string;
  onPick: (c: ContratoOpt) => void;
}) {
  return (
    <div>
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {titulo}
      </p>
      {items.map((c) => {
        const activo = c.id === valor;
        return (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={activo}
            onClick={() => onPick(c)}
            className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-surface-2 ${
              activo ? "bg-surface-2 font-medium text-ink" : "text-ink"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
