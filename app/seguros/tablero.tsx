"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, FilterChip, Money, StatusChip, Tabs } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { sumarDias } from "@/lib/cartera/fecha";
import {
  SECCIONES,
  etiquetaSeccion,
  fechaCorta,
  nombreAseguradora,
  tonoSeccion,
  type CasoFila,
  type Poliza,
  type Seccion,
} from "@/lib/seguros/modelo";

const PRIMARIO =
  "inline-flex rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black";

export function Tablero({
  casos,
  polizasPorVencer,
  hoy,
  esteMes,
  mesPasado,
}: {
  casos: CasoFila[];
  polizasPorVencer: number;
  hoy: string;
  esteMes: string;
  mesPasado: string;
}) {
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState<Seccion | "todas">("todas");

  const avisos = useMemo(() => {
    const lista: { id: string; texto: string; href: string }[] = [];
    for (const c of casos) {
      const carro = `${etiquetaCarroUi(c.empresa, c.numero)} ${c.placa}`.trim();
      const oficinaPendiente =
        (c.caso.seccion === "reportado" || c.caso.seccion === "cita") &&
        c.caso.avisoOficina !== c.fecha &&
        c.fecha <= hoy &&
        c.fecha >= sumarDias(hoy, -14);
      if (oficinaPendiente) {
        lista.push({
          id: c.id + "-oficina",
          href: `/seguros/${c.id}`,
          texto: `${carro}: citar a Juan Díaz. El choque fue el ${fechaCorta(c.fecha)}.`,
        });
      }
      const aud = c.caso.fechaAudiencia;
      const audienciaPendiente =
        c.caso.via === "parte" &&
        Boolean(aud) &&
        c.caso.avisoAudiencia !== aud &&
        aud <= sumarDias(hoy, 3) &&
        aud >= sumarDias(hoy, -2);
      if (audienciaPendiente) {
        lista.push({
          id: c.id + "-aud",
          href: `/seguros/${c.id}`,
          texto: `${carro}: audiencia el ${fechaCorta(aud)}. Avise al cliente y a Santiago.`,
        });
      }
    }
    return lista;
  }, [casos, hoy]);

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return casos.filter((c) => {
      if (seccion !== "todas" && c.caso.seccion !== seccion) return false;
      if (!texto) return true;
      const bolsa = [c.numero, c.placa, c.marca, c.caso.clienteNombre, c.caso.numeroReclamo, c.empresa]
        .join(" ")
        .toLowerCase();
      return bolsa.includes(texto);
    });
  }, [casos, q, seccion]);

  const abiertos = casos.filter((c) => c.caso.seccion !== "pagado" && c.caso.seccion !== "no_procede").length;
  const pagadoEste = casos
    .filter((c) => c.caso.fechaPago.startsWith(esteMes))
    .reduce((s, c) => s + (c.caso.montoFiniquito ?? 0), 0);
  const pagadoPasado = casos
    .filter((c) => c.caso.fechaPago.startsWith(mesPasado))
    .reduce((s, c) => s + (c.caso.montoFiniquito ?? 0), 0);
  const choquesEste = casos.filter((c) => c.fecha.startsWith(esteMes)).length;
  const choquesPasado = casos.filter((c) => c.fecha.startsWith(mesPasado)).length;

  const tabs = [
    { id: "todas", label: "Todos", count: casos.length },
    ...SECCIONES.map((s) => ({
      id: s.id,
      label: s.label,
      count: casos.filter((c) => c.caso.seccion === s.id).length,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumen label="Abiertos" valor={String(abiertos)} />
        <Resumen label="Para avisar" valor={String(avisos.length)} tono={avisos.length ? "text-ambar" : "text-ink"} />
        <Resumen label="Choques este mes" valor={String(choquesEste)} hint={`Mes pasado: ${choquesPasado}`} />
        <Resumen
          label="Pagado este mes"
          valor={<Money amount={pagadoEste} />}
          hint={<span>Mes pasado: <Money amount={pagadoPasado} /></span>}
        />
      </div>

      {polizasPorVencer > 0 && (
        <Link
          href="/seguros/polizas"
          className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line hover:ring-line-strong"
        >
          <span className="text-sm">
            <StatusChip tone="warn">Póliza</StatusChip>
            <span className="ml-2">
              {polizasPorVencer === 1
                ? "1 póliza vence en los próximos 30 días."
                : `${polizasPorVencer} pólizas vencen en los próximos 30 días.`}
            </span>
          </span>
          <span className="text-sm text-muted">Ver pólizas</span>
        </Link>
      )}

      {avisos.length > 0 && (
        <section className="rounded-xl bg-surface ring-1 ring-line">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Para avisar hoy</h2>
            <p className="mt-0.5 text-xs text-muted">Oficina al día siguiente. Audiencia, dos o tres días antes.</p>
          </div>
          <ul>
            {avisos.map((a) => (
              <li key={a.id} className="border-b border-line last:border-0">
                <Link href={a.href} className="block px-4 py-3 text-sm hover:bg-surface-2">
                  {a.texto}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Buscar caso</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Placa, número de carro o cliente"
            className="w-full rounded-lg bg-surface py-2.5 pl-9 pr-3 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
        </label>
        <Tabs tabs={tabs} active={seccion} onChange={(id) => setSeccion(id as Seccion | "todas")} />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          title={casos.length === 0 ? "Todavía no hay choques" : "Ningún caso en esta sección"}
          hint={casos.length === 0 ? "Cuando alguien reporte un choque, abra el caso desde aquí." : "Pruebe otra sección o borre la búsqueda."}
          action={
            casos.length === 0 ? (
              <Link href="/seguros/nuevo" className={PRIMARIO}>
                Registrar choque
              </Link>
            ) : (
              <FilterChip active={false} onClick={() => { setQ(""); setSeccion("todas"); }}>
                Ver todos
              </FilterChip>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Choque</th>
                <th className="px-4 py-3 font-medium">Camino</th>
                <th className="px-4 py-3 font-medium">Sección</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/seguros/${c.id}`} className="font-medium hover:underline">
                      {etiquetaCarroUi(c.empresa, c.numero)}
                    </Link>
                    <p className="font-mono text-xs text-muted">{c.placa || "Sin placa"}</p>
                  </td>
                  <td className="px-4 py-3">{c.caso.clienteNombre || "Sin cliente activo"}</td>
                  <td className="px-4 py-3 tabular-nums">{fechaCorta(c.fecha)}</td>
                  <td className="px-4 py-3">
                    {c.caso.via === "parte" ? "Parte" : c.caso.via === "fud" ? "FUD" : "—"}
                    {c.caso.aseguradora ? (
                      <span className="mt-0.5 block text-xs text-muted">{nombreAseguradora(c.caso.aseguradora)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip tone={tonoSeccion(c.caso.seccion)}>{etiquetaSeccion(c.caso.seccion)}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Resumen({
  label,
  valor,
  hint,
  tono = "text-ink",
}: {
  label: string;
  valor: ReactNode;
  hint?: ReactNode;
  tono?: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${tono}`}>{valor}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
