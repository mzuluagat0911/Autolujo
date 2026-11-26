"use client";

export function BotonImprimirContrato() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
    >
      Imprimir
    </button>
  );
}
