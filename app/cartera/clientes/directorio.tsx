"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PageHeader,
  StatusChip,
  FiltersBar,
  EmptyState,
  PageShell,
} from "@/components/kit";
import { Field, Select, FormCard, SubmitButton } from "@/components/form";
import { etiquetaGenero } from "@/lib/cartera/tratamiento";
import { AltaContratoForm } from "./alta-contrato";
import type { CarroLibre } from "./actions";

export type ClienteFila = {
  id: string;
  nombre: string;
  genero: string | null;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  score_financiero: number;
  activo: boolean;
};

type Filtro = "todos" | "activos" | "inactivos";
type PanelAlta = null | "contrato" | "solo";

export function ClientesDirectorio({
  clientes,
  error,
  carros,
  fechaHoy,
  createCliente,
  createClienteConContrato,
}: {
  clientes: ClienteFila[];
  error: string | null;
  carros: CarroLibre[];
  fechaHoy: string;
  createCliente: (fd: FormData) => Promise<void>;
  createClienteConContrato: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [alta, setAlta] = useState<PanelAlta>(null);

  const contadores = useMemo(() => {
    let activos = 0;
    let inactivos = 0;
    for (const c of clientes) {
      if (c.activo) activos++;
      else inactivos++;
    }
    return { activos, inactivos };
  }, [clientes]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtro === "activos" && !c.activo) return false;
      if (filtro === "inactivos" && c.activo) return false;
      if (!needle) return true;
      const blob = [c.nombre, c.cedula, c.telefono, c.whatsapp]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [clientes, q, filtro]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Directorio"
        title="Clientes"
        subtitle={`${clientes.length} en el directorio · alta con género y, si aplica, contrato atado a un carro libre.`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAlta(alta === "contrato" ? null : "contrato")}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                alta === "contrato"
                  ? "bg-ink text-white"
                  : "bg-white text-ink ring-1 ring-line hover:bg-surface-2"
              }`}
            >
              Cliente + contrato
            </button>
            <button
              type="button"
              onClick={() => setAlta(alta === "solo" ? null : "solo")}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                alta === "solo"
                  ? "bg-ink text-white"
                  : "bg-white text-ink ring-1 ring-line hover:bg-surface-2"
              }`}
            >
              Solo cliente
            </button>
          </div>
        }
      />

      {alta === "contrato" && (
        <section className="mt-6 rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cliente + contrato + carro</h2>
              <p className="mt-1 text-sm text-muted">
                Crea la persona, elige un carro libre y queda el contrato activo enlazado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAlta(null)}
              className="text-sm text-muted hover:text-ink"
            >
              Cerrar
            </button>
          </div>
          <AltaContratoForm
            carros={carros}
            fechaHoy={fechaHoy}
            action={createClienteConContrato}
          />
        </section>
      )}

      {alta === "solo" && (
        <section className="mt-6 rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Solo cliente</h2>
              <p className="mt-1 text-sm text-muted">Alta sin contrato; podés enlazarlo después.</p>
            </div>
            <button
              type="button"
              onClick={() => setAlta(null)}
              className="text-sm text-muted hover:text-ink"
            >
              Cerrar
            </button>
          </div>
          <FormCard action={createCliente}>
            <Field label="Nombre *" name="nombre" required placeholder="Juan Pérez" />
            <Select
              label="Género / tratamiento *"
              name="genero"
              required
              placeholder="Elegí…"
              options={[
                { value: "m", label: "Masculino — Sr." },
                { value: "f", label: "Femenino — Sra." },
              ]}
            />
            <Field label="Cédula" name="cedula" placeholder="8-888-8888" />
            <Field label="Teléfono" name="telefono" placeholder="6000-0000" />
            <Field label="WhatsApp" name="whatsapp" placeholder="+50760000000" />
            <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
              <input type="checkbox" name="mayor_de_25" className="h-4 w-4" />
              Mayor de 25 años
            </label>
            <div className="flex items-end sm:col-span-2">
              <SubmitButton>Guardar cliente</SubmitButton>
            </div>
          </FormCard>
        </section>
      )}

      <div className="mt-8 space-y-4">
        <FiltersBar
          search={{ value: q, onChange: setQ }}
          searchPlaceholder="Buscar nombre, cédula o WhatsApp…"
          chips={[
            { id: "todos", label: "Todos", count: clientes.length },
            { id: "activos", label: "Activos", count: contadores.activos },
            { id: "inactivos", label: "Inactivos", count: contadores.inactivos },
          ]}
          activeChip={filtro}
          onChip={(id) => setFiltro(id as Filtro)}
        />

        {error ? (
          <EmptyState title="No se pudo cargar" hint={error} />
        ) : visibles.length === 0 ? (
          <EmptyState
            title={clientes.length === 0 ? "Aún no hay clientes" : "Nadie coincide"}
            hint={
              clientes.length === 0
                ? "Creá el primero con «Cliente + contrato» o «Solo cliente»."
                : "Probá otro filtro o búsqueda."
            }
            action={
              clientes.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAlta("contrato")}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                >
                  Cliente + contrato
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">Trato</th>
                  <th className="px-5 py-3">Cédula</th>
                  <th className="px-5 py-3">WhatsApp</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-line bg-surface last:border-0 transition hover:bg-surface-2"
                  >
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/cartera/clientes/${c.id}`} className="hover:underline">
                        {c.nombre}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {c.genero ? (
                        <StatusChip tone={c.genero === "f" ? "purpura" : "azul"}>
                          {etiquetaGenero(c.genero)}
                        </StatusChip>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">{c.cedula ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-muted">{c.whatsapp ?? "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{c.score_financiero}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/cartera/clientes/${c.id}`}
                        className="text-muted hover:text-ink"
                      >
                        ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
