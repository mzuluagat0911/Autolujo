"use client";

import { useMemo, useState } from "react";
import {
  EmptyState,
  FiltersBar,
  Kpi,
  Money,
  PageHeader,
  PageShell,
  StatusChip,
} from "@/components/kit";
import { Field, FormCard, Select, SubmitButton, Textarea } from "@/components/form";
import type { EmpresaEx, EstadoExCliente, ExCliente } from "@/lib/cartera/ex-clientes";
import { registrarExCliente } from "./actions";

const ESTADOS: { id: "todos" | EstadoExCliente; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "cobro", label: "En cobro" },
  { id: "acuerdo", label: "Acuerdo" },
  { id: "pausado", label: "Pausado" },
  { id: "cerrado", label: "Cerrado" },
];

function chipEstado(estado: EstadoExCliente) {
  if (estado === "cobro") return <StatusChip tone="warn">En cobro</StatusChip>;
  if (estado === "acuerdo") return <StatusChip tone="azul">Acuerdo</StatusChip>;
  if (estado === "pausado") return <StatusChip tone="neutral">Pausado</StatusChip>;
  return <StatusChip tone="good">Cerrado</StatusChip>;
}

export function ListaExClientes({
  filas,
  empresas,
  error,
  aviso,
}: {
  filas: ExCliente[];
  empresas: EmpresaEx[];
  error: string | null;
  aviso?: string;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | EstadoExCliente>("todos");
  const [alta, setAlta] = useState(false);

  const conteos = useMemo(() => {
    const n = { cobro: 0, acuerdo: 0, pausado: 0, cerrado: 0 };
    for (const f of filas) n[f.estado] += 1;
    return n;
  }, [filas]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro !== "todos" && f.estado !== filtro) return false;
      if (!needle) return true;
      const blob = [f.nombre, f.cedula, f.telefono, f.whatsapp, f.carro, f.empresa, f.motivo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [filas, q, filtro]);

  const saldoVisible = visibles.reduce((a, f) => a + f.saldo, 0);
  const saldoCobro = filas.filter((f) => f.estado === "cobro").reduce((a, f) => a + f.saldo, 0);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cartera"
        title="Ex clientes"
        subtitle="Deuda del Excel. El cobro por WhatsApp arranca el lunes 16 de noviembre, aparte de la letra diaria."
        action={
          <button
            type="button"
            onClick={() => setAlta(!alta)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
              alta ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line hover:bg-surface-2"
            }`}
          >
            Registrar a mano
          </button>
        }
      />

      {aviso && (
        <p className="mb-6 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {aviso}
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-xl bg-surface p-5 text-sm text-rojo ring-1 ring-line">{error}</p>
      )}

      {alta && (
        <section className="mb-8 rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Registro manual</h2>
              <p className="mt-1 text-sm text-muted">
                Nombre, empresa y saldo. El celular sirve para cobrarle por WhatsApp cuando el agente esté listo.
              </p>
            </div>
            <button type="button" onClick={() => setAlta(false)} className="text-sm text-muted hover:text-ink">
              Cerrar
            </button>
          </div>
          <FormCard action={registrarExCliente}>
            <Field label="Nombre *" name="nombre" required placeholder="Juan Pérez" />
            <Field label="Cédula" name="cedula" placeholder="8-888-8888" />
            <Field label="Celular" name="celular" placeholder="6000-0000" />
            <Select
              label="Empresa *"
              name="empresa_id"
              required
              placeholder="Elegí…"
              options={empresas.map((e) => ({ value: e.id, label: `${e.codigo} · ${e.nombre}` }))}
            />
            <Field label="Carro (si lo recuerdan)" name="carro" placeholder="G33" />
            <Field label="Saldo *" name="saldo" type="number" required min={0} step="0.01" placeholder="589" />
            <Field label="Motivo" name="motivo" placeholder="Entregó debiendo, años atrás" />
            <Textarea label="Notas" name="notas" placeholder="Quién lo mandó, de qué año, etc." />
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <SubmitButton>Guardar ex cliente</SubmitButton>
            </div>
          </FormCard>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Registrados" value={filas.length} />
        <Kpi label="En cobro" value={conteos.cobro} tone={conteos.cobro > 0 ? "warn" : "default"} />
        <Kpi label="Saldo en cobro" value={<Money amount={saldoCobro} />} tone={saldoCobro > 0 ? "crit" : "default"} />
        <Kpi label="Lista filtrada" value={<Money amount={saldoVisible} />} />
      </div>

      <div className="mt-6">
        <FiltersBar
          search={{ value: q, onChange: setQ }}
          searchPlaceholder="Nombre, cédula, celular o carro…"
          chips={ESTADOS.map((e) => ({
            id: e.id,
            label: e.label,
            count: e.id === "todos" ? undefined : conteos[e.id],
          }))}
          activeChip={filtro}
          onChip={(id) => setFiltro(id as typeof filtro)}
        />
      </div>

      {visibles.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={filas.length === 0 ? "Todavía no hay ex clientes cargados" : "Nadie coincide con el filtro"}
            hint={
              filas.length === 0
                ? "Registrá a mano a quien aparezca a pagar, o cargá el Excel cuando llegue."
                : "Probá otro nombre o estado."
            }
            action={
              filas.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAlta(true)}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                >
                  Registrar a mano
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Cédula</th>
                <th className="px-4 py-3">Celular</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Carro</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-medium">{f.nombre}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{f.cedula ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.telefono ?? f.whatsapp ?? "—"}</td>
                  <td className="px-4 py-2.5">{f.empresa}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.carro ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-rojo">
                    <Money amount={f.saldo} />
                  </td>
                  <td className="px-4 py-2.5">{chipEstado(f.estado)}</td>
                  <td className="max-w-[220px] px-4 py-2.5 text-muted">{f.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
