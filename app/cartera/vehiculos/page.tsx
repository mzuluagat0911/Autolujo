import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Kpi } from "@/components/kit";
import { Field, Select, SubmitButton, FormCard } from "@/components/form";
import { createVehiculo } from "./actions";
import { hoyPanama } from "@/lib/cartera/fecha";
import { lineaSalidaHoy, salidasDelDia } from "@/lib/cartera/salidas-aplicar";
import { ListaVehiculos, type FilaVehiculo } from "./lista";

export const dynamic = "force-dynamic";

const TOPE_KM_MES = 8000;

type Empresa = { id: string; codigo: string; nombre: string };

const ESTADOS = [
  { value: "activo", label: "Activo" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "chapisteria", label: "Chapistería" },
  { value: "por_entregar", label: "Por entregar" },
  { value: "improductivo", label: "Improductivo" },
  { value: "entregado", label: "Entregado" },
];

async function getData() {
  try {
    const sb = createServerSupabase();
    const hoy = hoyPanama();
    const mesIni = `${hoy.slice(0, 7)}-01`;

    const [emp, veh, contratos, kmMesRes, kmHoyRes, salidas] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("vehiculos")
        .select(
          "id, numero, placa, marca, modelo, anio, km_actual, gps_id, panapass, estado, empresa:empresas(codigo)",
        )
        .order("numero"),
      sb
        .from("contratos")
        .select("id, vehiculo_id, letra_diaria, cliente:clientes(nombre)")
        .eq("estado", "activo"),
      sb.from("gps_dias").select("vehiculo_id, km").gte("fecha", mesIni).lte("fecha", hoy).not("vehiculo_id", "is", null),
      sb
        .from("gps_dias")
        .select("vehiculo_id, km, alerta")
        .eq("fecha", hoy)
        .not("vehiculo_id", "is", null),
      salidasDelDia(hoy),
    ]);

    if (emp.error) throw emp.error;

    type VehiculoRow = {
      id: string;
      numero: string;
      placa: string | null;
      marca: string | null;
      modelo: string | null;
      anio: number | null;
      km_actual: number | null;
      gps_id: string | null;
      panapass: string | null;
      estado: string;
      empresa: { codigo: string } | null;
    };

    let vehiculos: VehiculoRow[];
    if (veh.error) {
      if (!/panapass/i.test(veh.error.message)) throw veh.error;
      const retry = await sb
        .from("vehiculos")
        .select(
          "id, numero, placa, marca, modelo, anio, km_actual, gps_id, estado, empresa:empresas(codigo)",
        )
        .order("numero");
      if (retry.error) throw retry.error;
      vehiculos = ((retry.data ?? []) as unknown as Omit<VehiculoRow, "panapass">[]).map((r) => ({
        ...r,
        panapass: null,
      }));
    } else {
      vehiculos = (veh.data as unknown as VehiculoRow[]) ?? [];
    }

    const porContrato = new Map<
      string,
      { contratoId: string; cliente: string | null; letra: number | null }
    >();
    if (!contratos.error) {
      for (const c of (contratos.data ?? []) as {
        id: string;
        vehiculo_id: string;
        letra_diaria: number | null;
        cliente: { nombre: string } | null;
      }[]) {
        if (porContrato.has(c.vehiculo_id)) continue;
        porContrato.set(c.vehiculo_id, {
          contratoId: c.id,
          cliente: c.cliente?.nombre ?? null,
          letra: c.letra_diaria == null ? null : Number(c.letra_diaria),
        });
      }
    }

    const kmMes = new Map<string, number>();
    if (!kmMesRes.error) {
      for (const r of (kmMesRes.data ?? []) as { vehiculo_id: string; km: number | null }[]) {
        kmMes.set(r.vehiculo_id, (kmMes.get(r.vehiculo_id) ?? 0) + Number(r.km ?? 0));
      }
    }

    const kmHoy = new Map<string, { km: number | null; alerta: string | null }>();
    if (!kmHoyRes.error) {
      for (const r of (kmHoyRes.data ?? []) as {
        vehiculo_id: string;
        km: number | null;
        alerta: string | null;
      }[]) {
        kmHoy.set(r.vehiculo_id, {
          km: r.km == null ? null : Number(r.km),
          alerta: r.alerta,
        });
      }
    }

    const porSalida = new Map<string, (typeof salidas)[number]>();
    for (const s of salidas) {
      if (s.vehiculoId && !porSalida.has(s.vehiculoId)) porSalida.set(s.vehiculoId, s);
    }

    const filas: FilaVehiculo[] = vehiculos.map((v) => {
      const c = porContrato.get(v.id);
      const g = kmHoy.get(v.id);
      const s = porSalida.get(v.id);
      return {
        id: v.id,
        numero: v.numero,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        anio: v.anio,
        km_actual: v.km_actual,
        gps_id: v.gps_id,
        panapass: v.panapass,
        estado: v.estado,
        empresa: v.empresa?.codigo ?? null,
        cliente: c?.cliente ?? null,
        letra: c?.letra ?? null,
        contratoId: c?.contratoId ?? null,
        kmMes: kmMes.has(v.id) ? Math.round((kmMes.get(v.id) ?? 0) * 10) / 10 : null,
        kmHoy: g?.km ?? null,
        alertaGps: g?.alerta ?? null,
        salida: s
          ? {
              destino: s.destino,
              fecha: s.fecha ?? null,
              fechaHasta: s.fechaHasta ?? null,
              fueraTabla: Boolean(s.fueraTabla),
              estadoAval: s.estadoAval,
              estadoPago: s.estadoPago,
              gpsEstado: s.gpsEstado ?? null,
            }
          : null,
      };
    });

    return {
      empresas: (emp.data as Empresa[]) ?? [],
      filas,
      salidas,
      error: null as string | null,
    };
  } catch (e) {
    return {
      empresas: [] as Empresa[],
      filas: [] as FilaVehiculo[],
      salidas: [] as Awaited<ReturnType<typeof salidasDelDia>>,
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

export default async function VehiculosPage() {
  const { empresas, filas, salidas, error } = await getData();
  const empOptions = empresas.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }));

  const conContrato = filas.filter((v) => v.contratoId).length;
  const sinGps = filas.filter((v) => !v.gps_id).length;
  const excesoMes = filas.filter((v) => v.kmMes != null && v.kmMes > TOPE_KM_MES).length;
  const salidasHoy = filas.filter((v) => v.salida).length;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Vehículos"
        subtitle="Flota por empresa: quién lo tiene, km del mes, GPS y salidas de hoy."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="En flota" value={filas.length} />
        <Kpi label="Con contrato" value={conContrato} hint={`${filas.length - conContrato} libres`} />
        <Kpi
          label="Salidas hoy"
          value={salidasHoy}
          tone={salidasHoy > 0 ? "warn" : "default"}
        />
        <Kpi
          label={`Sobre ${TOPE_KM_MES.toLocaleString("es-PA")} km`}
          value={excesoMes}
          tone={excesoMes > 0 ? "crit" : "default"}
          hint={`${sinGps} sin amarre GPS`}
        />
      </div>

      {salidas.length > 0 && (
        <div className="mt-6 rounded-xl bg-ambar-wash px-5 py-4 ring-1 ring-ambar/25">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ambar">
            Salidas de hoy · {salidas.length}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {salidas.map((s) => (
              <li key={s.id}>{lineaSalidaHoy(s)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <FormCard action={createVehiculo}>
          <Select label="Empresa *" name="empresa_id" required placeholder="Selecciona…" options={empOptions} />
          <Field label="Número de carro *" name="numero" required placeholder="210" />
          <Field label="Placa" name="placa" placeholder="AB1234" />
          <Field label="Marca" name="marca" placeholder="Hyundai" />
          <Field label="Modelo" name="modelo" placeholder="Grand i10" />
          <Field label="Año" name="anio" type="number" placeholder="2020" />
          <Field label="Km actual" name="km_actual" type="number" placeholder="0" />
          <Field label="ID GPS Diacor" name="gps_id" placeholder="34287" />
          <Field label="PanaPass" name="panapass" placeholder="Opcional" />
          <Select label="Estado" name="estado" options={ESTADOS} defaultValue="activo" />
          <div className="flex items-end">
            <SubmitButton>Guardar vehículo</SubmitButton>
          </div>
        </FormCard>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">
          {error}
        </p>
      ) : (
        <ListaVehiculos filas={filas} topeKmMes={TOPE_KM_MES} />
      )}
    </div>
  );
}
