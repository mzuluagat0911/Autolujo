"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/form";
import type { CarroLibre } from "./actions";

export function AltaContratoForm({
  carros,
  fechaHoy,
  action,
}: {
  carros: CarroLibre[];
  fechaHoy: string;
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cobraDomingo, setCobraDomingo] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    setErr(null);
    start(async () => {
      const r = await action(fd);
      if (!r.ok) {
        setErr(r.error ?? "No se pudo guardar.");
        return;
      }
      setMsg("Cliente y contrato creados. Ya están enlazados.");
      e.currentTarget.reset();
      setCobraDomingo(false);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="Nombre *" name="nombre" required placeholder="María González" />
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
      <Field label="Código conductor" name="codigo" placeholder="1725" />
      <Field label="Cédula" name="cedula" placeholder="8-888-8888" />
      <Field label="Teléfono" name="telefono" placeholder="6000-0000" />
      <Field label="WhatsApp" name="whatsapp" placeholder="+50760000000" />

      <Select
        label="Carro libre *"
        name="vehiculo_id"
        required
        placeholder={carros.length ? "Elegí carro…" : "No hay carros libres"}
        options={carros.map((c) => ({ value: c.id, label: c.label }))}
      />
      <Field
        label="Fecha inicio *"
        name="fecha_inicio"
        type="date"
        required
        defaultValue={fechaHoy}
      />
      <Field label="Letra diaria (USD) *" name="letra_diaria" type="number" required step="0.01" min="1" placeholder="30" />
      <Field label="Nº cuotas totales" name="num_cuotas_total" type="number" min="1" placeholder="1200" />
      <Field label="Abono inicial" name="abono_inicial" type="number" step="0.01" min="0" placeholder="0" />
      <Field label="Desc. puntual" name="descuento_puntual" type="number" step="0.01" min="0" defaultValue={5} />

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          name="mayor_de_25"
          className="h-4 w-4"
          defaultChecked
        />
        Mayor de 25 años
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          name="cobra_domingo"
          className="h-4 w-4"
          checked={cobraDomingo}
          onChange={(e) => setCobraDomingo(e.target.checked)}
        />
        Cobra domingo
      </label>
      {cobraDomingo && (
        <Field label="Cuota domingo" name="cuota_domingo" type="number" step="0.01" min="0" placeholder="30" />
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending || carros.length === 0}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Creando…" : "Crear cliente y contrato"}
        </button>
        {carros.length === 0 && (
          <p className="text-sm text-ambar">No hay carros libres (todos tienen contrato activo).</p>
        )}
        {msg && <p className="text-sm text-verde">{msg}</p>}
        {err && <p className="text-sm text-rojo">{err}</p>}
      </div>
    </form>
  );
}
