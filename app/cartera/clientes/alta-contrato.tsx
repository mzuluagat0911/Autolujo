"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/form";
import type { CarroLibre } from "./actions";

const PANAPASS = 20;
const DOMINGOS_ENTRADA = 90;
const CUOTA_DOMINGO = 30;

function money(n: number) {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

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

  const [cobraDomingo, setCobraDomingo] = useState(true);
  const [cuotaDomingo, setCuotaDomingo] = useState(String(CUOTA_DOMINGO));
  const [abonoPactado, setAbonoPactado] = useState("");
  const [abonoPagado, setAbonoPagado] = useState("");
  const [abonoCuota, setAbonoCuota] = useState("5");
  const [panapassPagado, setPanapassPagado] = useState(String(PANAPASS));
  const [domingosPagado, setDomingosPagado] = useState(String(DOMINGOS_ENTRADA));
  const [prepagoLetras, setPrepagoLetras] = useState("0");
  const [prepagoDomingos, setPrepagoDomingos] = useState("0");
  const [letra, setLetra] = useState("");

  const abonoP = Math.max(Number(String(abonoPactado).replace(",", ".")) || 0, 0);
  const abonoPay = Math.max(Number(String(abonoPagado).replace(",", ".")) || 0, 0);
  const restante = Math.max(Math.round((abonoP - abonoPay) * 100) / 100, 0);
  const panPay = Math.max(Number(String(panapassPagado).replace(",", ".")) || 0, 0);
  const domPay = Math.max(Number(String(domingosPagado).replace(",", ".")) || 0, 0);
  const preL = Math.max(Number(String(prepagoLetras).replace(",", ".")) || 0, 0);
  const preD = Math.max(Number(String(prepagoDomingos).replace(",", ".")) || 0, 0);
  const letraN = Math.max(Number(String(letra).replace(",", ".")) || 0, 0);

  const totalPago = Math.round((panPay + domPay + abonoPay + preL + preD) * 100) / 100;

  const desglose = useMemo(() => {
    const rows: { label: string; monto: number }[] = [];
    if (panPay > 0) rows.push({ label: "Panapass", monto: panPay });
    if (domPay > 0) rows.push({ label: "Domingos (entrada)", monto: domPay });
    if (abonoPay > 0) rows.push({ label: "Abono inicial", monto: abonoPay });
    if (preL > 0) rows.push({ label: "Letras adelantadas", monto: preL });
    if (preD > 0) rows.push({ label: "Domingos adelantados", monto: preD });
    return rows;
  }, [panPay, domPay, abonoPay, preL, preD]);

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
      setMsg("Cliente, contrato y pago de entrada registrados.");
      e.currentTarget.reset();
      setCobraDomingo(true);
      setCuotaDomingo(String(CUOTA_DOMINGO));
      setAbonoPactado("");
      setAbonoPagado("");
      setAbonoCuota("5");
      setPanapassPagado(String(PANAPASS));
      setDomingosPagado(String(DOMINGOS_ENTRADA));
      setPrepagoLetras("0");
      setPrepagoDomingos("0");
      setLetra("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Cliente */}
      <section className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:col-span-2 lg:col-span-3">
          Cliente
        </h3>
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
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="mayor_de_25" className="h-4 w-4" defaultChecked />
          Mayor de 25 años
        </label>
      </section>

      {/* Contrato */}
      <section className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:col-span-2 lg:col-span-3">
          Contrato
        </h3>
        <Select
          label="Carro libre *"
          name="vehiculo_id"
          required
          placeholder={carros.length ? "Elegí carro…" : "No hay carros libres"}
          options={carros.map((c) => ({ value: c.id, label: c.label }))}
        />
        <Field
          label="Fecha inicio contrato *"
          name="fecha_inicio"
          type="date"
          required
          defaultValue={fechaHoy}
          hint="Entrega / inicio del deal"
        />
        <Field
          label="Inicio cobro de letra *"
          name="fecha_inicio_letra"
          type="date"
          required
          defaultValue={fechaHoy}
          hint="Desde cuándo corre la letra diaria"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Letra diaria (USD) *
          </span>
          <input
            name="letra_diaria"
            required
            type="number"
            step="0.01"
            min="1"
            placeholder="33"
            value={letra}
            onChange={(e) => setLetra(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <Field label="Nº cuotas totales" name="num_cuotas_total" type="number" min="1" placeholder="1275" />
        <Field label="Desc. puntual" name="descuento_puntual" type="number" step="0.01" min="0" defaultValue={5} />

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
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Cuota domingo
            </span>
            <input
              name="cuota_domingo"
              type="number"
              step="0.01"
              min="0"
              value={cuotaDomingo}
              onChange={(e) => setCuotaDomingo(e.target.value)}
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
        )}
      </section>

      {/* Abono */}
      <section className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:col-span-2 lg:col-span-3">
          Abono inicial
        </h3>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Abono pactado
          </span>
          <input
            name="abono_inicial"
            type="number"
            step="0.01"
            min="0"
            placeholder="250"
            value={abonoPactado}
            onChange={(e) => {
              setAbonoPactado(e.target.value);
              if (!abonoPagado) setAbonoPagado(e.target.value);
            }}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Abono pagado hoy
          </span>
          <input
            name="abono_pagado"
            type="number"
            step="0.01"
            min="0"
            placeholder="150"
            value={abonoPagado}
            onChange={(e) => setAbonoPagado(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
        </label>
        {restante > 0.009 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Cuota diaria del restante *
            </span>
            <input
              name="abono_cuota_diaria"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={abonoCuota}
              onChange={(e) => setAbonoCuota(e.target.value)}
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
            <span className="text-xs text-muted">
              Resta {money(restante)} → se cobra {money(Number(abonoCuota) || 0)}/día hasta liquidar
              (ítem extra, prioridad acuerdos).
            </span>
          </label>
        )}
        {restante <= 0.009 && abonoP > 0 && (
          <p className="text-sm text-verde sm:col-span-2">Abono cubierto completo hoy.</p>
        )}
      </section>

      {/* Entrada + prepago */}
      <section className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:col-span-2 lg:col-span-3">
          Entrada y prepago
        </h3>
        <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">
          De entrada debe <strong className="text-ink">Panapass {money(PANAPASS)}</strong> +{" "}
          <strong className="text-ink">
            Domingos {money(DOMINGOS_ENTRADA)}
          </strong>{" "}
          (3 × {money(CUOTA_DOMINGO)}). Indicá cuánto paga hoy de cada rubro; puede adelantar letras o
          domingos.
        </p>
        <input type="hidden" name="domingos_entrada" value={DOMINGOS_ENTRADA} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Panapass pagado hoy
          </span>
          <input
            name="panapass_pagado"
            type="number"
            step="0.01"
            min="0"
            max={PANAPASS}
            value={panapassPagado}
            onChange={(e) => setPanapassPagado(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
          <span className="text-xs text-muted">Obligatorio para entregar el carro ({money(PANAPASS)})</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Domingos pagados hoy
          </span>
          <input
            name="domingos_pagado"
            type="number"
            step="0.01"
            min="0"
            max={DOMINGOS_ENTRADA}
            value={domingosPagado}
            onChange={(e) => setDomingosPagado(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Prepago letras (USD)
          </span>
          <input
            name="prepago_letras"
            type="number"
            step="0.01"
            min="0"
            value={prepagoLetras}
            onChange={(e) => setPrepagoLetras(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
          {letraN > 0 && preL > 0 && (
            <span className="text-xs text-muted">≈ {(preL / letraN).toFixed(1)} letras a {money(letraN)}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Prepago domingos extra (USD)
          </span>
          <input
            name="prepago_domingos"
            type="number"
            step="0.01"
            min="0"
            value={prepagoDomingos}
            onChange={(e) => setPrepagoDomingos(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
      </section>

      {/* Pago único */}
      <section className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted sm:col-span-2 lg:col-span-3">
          Comprobante de entrada (un solo pago)
        </h3>

        <div className="rounded-lg bg-surface-2 p-4 text-sm sm:col-span-2 lg:col-span-3">
          {desglose.length === 0 ? (
            <p className="text-muted">Sin montos de pago — solo se crea el contrato y los cargos.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {desglose.map((r) => (
                <li key={r.label} className="flex justify-between gap-4">
                  <span className="text-muted">{r.label}</span>
                  <span className="font-medium text-ink">{money(r.monto)}</span>
                </li>
              ))}
              <li className="mt-2 flex justify-between gap-4 border-t border-line pt-2">
                <span className="font-medium text-ink">Total a registrar</span>
                <span className="font-medium text-ink">{money(totalPago)}</span>
              </li>
            </ul>
          )}
        </div>

        {totalPago > 0.009 && (
          <>
            <Select
              label="Método *"
              name="metodo"
              required
              placeholder="Elegí…"
              options={[
                { value: "efectivo", label: "Efectivo (confirmado)" },
                { value: "tarjeta", label: "Tarjeta (confirmado)" },
                { value: "transferencia", label: "Transferencia (pendiente de conciliar)" },
              ]}
            />
            <Field label="Referencia / voucher" name="referencia" placeholder="Opcional" />
            <Field label="Notas del pago" name="pago_notas" placeholder="Opcional" />
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
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
