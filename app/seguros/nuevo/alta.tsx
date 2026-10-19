"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/kit";
import { ASEGURADORAS } from "@/lib/seguros/modelo";
import { crearCaso } from "../actions";
import type { CarroParaCaso } from "@/lib/seguros/datos";

const INPUT =
  "w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20";

export function AltaChoque({ carros, hoy }: { carros: CarroParaCaso[]; hoy: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [carroId, setCarroId] = useState("");
  const [via, setVia] = useState<"fud" | "parte" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const elegido = carros.find((c) => c.id === carroId) ?? null;
  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 1) return [];
    return carros
      .filter((c) => `${c.etiqueta} ${c.placa} ${c.cliente} ${c.marca}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [carros, q]);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehiculo_id", carroId);
    fd.set("via", via);
    setError(null);
    start(async () => {
      const r = await crearCaso(fd);
      if (!r.ok || !r.id) {
        setError(r.error ?? "No se pudo abrir el caso.");
        return;
      }
      if (r.msg) setAviso(r.msg);
      router.push(`/seguros/${r.id}`);
    });
  }

  return (
    <form onSubmit={enviar} className="flex max-w-xl flex-col gap-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Carro</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Placa o número, por ejemplo EG1484"
          className={INPUT}
          autoFocus
        />
        {elegido && (
          <p className="text-sm">
            Elegido: <span className="font-medium">{elegido.etiqueta}</span>
            {elegido.placa ? ` · ${elegido.placa}` : ""}
            {elegido.cliente ? ` · ${elegido.cliente}` : " · sin cliente activo"}
          </p>
        )}
        {resultados.length > 0 && (
          <ul className="overflow-hidden rounded-lg ring-1 ring-line">
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCarroId(c.id);
                    setQ(`${c.etiqueta} ${c.placa}`.trim());
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-surface-2 ${
                    c.id === carroId ? "bg-surface-2" : "bg-surface"
                  }`}
                >
                  <span>
                    <span className="font-medium">{c.etiqueta}</span>
                    <span className="ml-2 font-mono text-xs text-muted">{c.placa}</span>
                  </span>
                  <span className="text-xs text-muted">{c.cliente || "Sin cliente"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      <fieldset>
        <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Qué pasó</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Camino
            activo={via === "fud"}
            titulo="FUD"
            texto="El otro carro acepta la culpa y el daño es leve. Se llama al seguro."
            onClick={() => setVia("fud")}
          />
          <Camino
            activo={via === "parte"}
            titulo="Parte policivo"
            texto="Nadie acepta, hay lesionados, daño mecánico, grúa, taxi o carro de empresa."
            onClick={() => setVia("parte")}
          />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha del choque</span>
          <input name="fecha" type="date" required defaultValue={hoy} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Aseguradora</span>
          <select name="aseguradora" defaultValue="" className={INPUT}>
            <option value="">Todavía no sé</option>
            {ASEGURADORAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} · {a.telefono}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Dónde fue</span>
        <input name="lugar" placeholder="Corredor, calle, referencia" className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Qué contó el cliente</span>
        <textarea name="relato" rows={3} placeholder="En una frase: quién iba, qué chocó y si el carro camina." className={`${INPUT} resize-y`} />
      </label>

      {error && <p className="text-sm text-rojo">{error}</p>}

      <button
        type="submit"
        disabled={pending || !carroId || !via}
        className="w-fit rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
      >
        {pending ? "Abriendo…" : "Abrir el caso"}
      </button>
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
    </form>
  );
}

function Camino({
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
