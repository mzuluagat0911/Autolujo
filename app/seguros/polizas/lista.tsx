"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StatusChip, Toast } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import type { CarroParaCaso } from "@/lib/seguros/datos";
import { ASEGURADORAS, fechaCorta, nombreAseguradora, type Poliza } from "@/lib/seguros/modelo";
import { guardarPolizaAccion, subirDocEmpresa } from "../actions";

const INPUT =
  "w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20";

export function ListaPolizas({
  carros,
  polizas,
  empresas,
  urls,
  hoy,
}: {
  carros: CarroParaCaso[];
  polizas: Poliza[];
  empresas: { id: string; codigo: string; nombre: string }[];
  urls: Record<string, string>;
  hoy: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [carroId, setCarroId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const limite = sumarDias(hoy, 30);

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return carros.filter((c) => `${c.etiqueta} ${c.placa}`.toLowerCase().includes(t)).slice(0, 6);
  }, [carros, q]);

  const ordenadas = [...polizas].sort((a, b) => a.vence.localeCompare(b.vence));

  function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehiculo_id", carroId);
    setError(null);
    start(async () => {
      const r = await guardarPolizaAccion(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar la póliza.");
        return;
      }
      setAviso("Póliza guardada.");
      setCarroId("");
      setQ("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={guardar} className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Cargar o renovar una póliza</h2>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Carro</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa o número" className={INPUT} />
          {resultados.length > 0 && (
            <ul className="overflow-hidden rounded-lg ring-1 ring-line">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCarroId(c.id);
                      setQ(`${c.etiqueta} ${c.placa}`);
                    }}
                    className="flex w-full justify-between bg-surface px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="font-medium">{c.etiqueta}</span>
                    <span className="font-mono text-xs text-muted">{c.placa}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Vence</span>
          <input name="vence" type="date" required className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Aseguradora</span>
          <select name="aseguradora" className={INPUT} defaultValue="">
            <option value="">Elegí…</option>
            {ASEGURADORAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Número de póliza</span>
          <input name="numero" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">PDF</span>
          <input name="archivo" type="file" accept="application/pdf,image/*" className="text-sm" />
        </label>
        {error && <p className="text-sm text-rojo sm:col-span-2">{error}</p>}
        <button
          type="submit"
          disabled={pending || !carroId}
          className="w-fit rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar póliza"}
        </button>
      </form>

      {ordenadas.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay pólizas cargadas. La alerta sale un mes antes de vencer.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Aseguradora</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((p) => {
                const cerca = p.vence <= limite;
                const vencida = p.vence < hoy;
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{etiquetaCarroUi(p.empresa, p.numeroCarro)}</span>
                      <span className="ml-2 font-mono text-xs text-muted">{p.placa}</span>
                    </td>
                    <td className="px-4 py-3">
                      {nombreAseguradora(p.aseguradora) || "—"}
                      {p.numero ? <span className="mt-0.5 block text-xs text-muted">{p.numero}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums">{fechaCorta(p.vence)}</span>
                      {vencida ? (
                        <span className="ml-2"><StatusChip tone="crit">Vencida</StatusChip></span>
                      ) : cerca ? (
                        <span className="ml-2"><StatusChip tone="warn">Este mes</StatusChip></span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {p.path && urls[p.path] ? (
                        <a href={urls[p.path]} target="_blank" rel="noreferrer" className="hover:underline">
                          Abrir
                        </a>
                      ) : (
                        <span className="text-muted">Sin archivo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <h2 className="text-sm font-semibold">Papeles de cada empresa</h2>
        <p className="mt-1 text-xs text-muted">Van en todos los paquetes: registro público y documento del representante legal.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {empresas.map((e) => (
            <div key={e.id} className="rounded-lg p-3 ring-1 ring-line">
              <p className="text-sm font-medium">{e.nombre}</p>
              <DocEmpresa empresaId={e.id} cual="registro" label="Registro público" urls={urls} disabled={pending} onListo={() => { setAviso("Documento guardado."); router.refresh(); }} onError={setError} />
              <DocEmpresa empresaId={e.id} cual="representante" label="Representante legal" urls={urls} disabled={pending} onListo={() => { setAviso("Documento guardado."); router.refresh(); }} onError={setError} />
            </div>
          ))}
        </div>
      </section>
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
    </div>
  );
}

function DocEmpresa({
  empresaId,
  cual,
  label,
  urls,
  disabled,
  onListo,
  onError,
}: {
  empresaId: string;
  cual: "registro" | "representante";
  label: string;
  urls: Record<string, string>;
  disabled: boolean;
  onListo: () => void;
  onError: (m: string) => void;
}) {
  const path = `seguros/empresas/${empresaId}/${cual}`;
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("empresa_id", empresaId);
        fd.set("cual", cual);
        start(async () => {
          const r = await subirDocEmpresa(fd);
          if (!r.ok) onError(r.error ?? "No se pudo subir.");
          else onListo();
        });
      }}
    >
      <p className="text-xs text-muted">{label}</p>
      {urls[path] ? (
        <a href={urls[path]} target="_blank" rel="noreferrer" className="text-xs hover:underline">
          Ver actual
        </a>
      ) : (
        <p className="text-xs text-faint">Sin archivo</p>
      )}
      <input name="archivo" type="file" accept="application/pdf,image/*" className="mt-1 block w-full text-xs" />
      <button type="submit" disabled={disabled || pending} className="mt-1 text-xs font-medium hover:underline disabled:opacity-50">
        {pending ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}
