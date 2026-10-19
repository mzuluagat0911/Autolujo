"use client";

import { useMemo, useState } from "react";
import { EmptyState, FilterChip, FiltersBar, Kpi, Money } from "@/components/kit";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { fechaConDia, sumarDias } from "@/lib/cartera/fecha";
import type { PanelOperativo } from "@/lib/cartera/panel-operativo";

const ESTADO: Record<string, string> = {
  improductivo: "Improductivo",
  chapisteria: "Chapistería",
  mantenimiento: "Mantenimiento",
  colision: "Colisión",
};

function diasDelMes(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let dia = desde;
  while (dia <= hasta && out.length < 31) {
    out.push(dia);
    dia = sumarDias(dia, 1);
  }
  return out;
}

function suma(nums: number[]): number {
  return Math.round(nums.reduce((a, n) => a + n, 0) * 100) / 100;
}

export function PanelOperativoVista({ datos }: { datos: PanelOperativo }) {
  const dias = useMemo(() => diasDelMes(datos.desde, datos.hasta), [datos.desde, datos.hasta]);
  const [empresa, setEmpresa] = useState("todas");
  const [elegidos, setElegidos] = useState<string[]>([datos.hasta]);
  const activos = elegidos.length > 0 ? elegidos : dias;
  const enEmpresa = (codigo: string) => empresa === "todas" || codigo === empresa;

  function alternarDia(dia: string) {
    setElegidos((prev) => {
      const base = prev.length > 0 ? prev : dias;
      return base.includes(dia) ? base.filter((d) => d !== dia) : [...base, dia].sort();
    });
  }

  const recaudo = datos.recaudo.filter((r) => activos.includes(r.fecha) && enEmpresa(r.empresa));
  const porDia = activos
    .map((fecha) => {
      const filas = recaudo.filter((r) => r.fecha === fecha);
      return {
        fecha,
        monto: suma(filas.map((f) => f.monto)),
        pagos: filas.reduce((a, f) => a + f.pagos, 0),
      };
    })
    .filter((f) => f.pagos > 0);
  const porEmpresa = datos.empresas.map((codigo) => {
    const filas = datos.recaudo.filter((r) => r.empresa === codigo && activos.includes(r.fecha));
    return { codigo, monto: suma(filas.map((f) => f.monto)), pagos: filas.reduce((a, f) => a + f.pagos, 0) };
  });
  const total = suma(recaudo.map((r) => r.monto));

  const noPagos = datos.noPagos.filter((f) => enEmpresa(f.empresa));
  const impro = datos.improductivos.filter((f) => enEmpresa(f.empresa));
  const espera = datos.porEntregar.filter((f) => enEmpresa(f.empresa));
  const carrosNoPagos = noPagos.reduce((a, f) => a + f.carros, 0);
  const plataNoPagos = suma(noPagos.map((f) => f.monto));
  const carrosImpro = impro.reduce((a, f) => a + f.carros, 0);
  const letraImpro = suma(impro.map((f) => f.letra));
  const carrosEspera = espera.reduce((a, f) => a + f.carros, 0);

  const movimientos = datos.movimientos.filter((m) => activos.includes(m.fecha) && enEmpresa(m.empresa));
  const entregas = movimientos.filter((m) => m.tipo === "entrega");
  const devoluciones = movimientos.filter((m) => m.tipo === "devolucion");

  const porEstado = [...new Set(impro.map((f) => f.estado))].map((estado) => ({
    estado,
    carros: impro.filter((f) => f.estado === estado).reduce((a, f) => a + f.carros, 0),
    letra: suma(impro.filter((f) => f.estado === estado).map((f) => f.letra)),
  }));

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recaudo</h2>
        <div className="mt-4 space-y-3">
          <FiltersBar
            variant="bare"
            chips={[
              { id: "todas", label: "Todas" },
              ...datos.empresas.map((codigo) => ({ id: codigo, label: siglaEmpresa(codigo) })),
            ]}
            activeChip={empresa}
            onChip={setEmpresa}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={activos.length === 1 && activos[0] === datos.hasta} onClick={() => setElegidos([datos.hasta])}>
              Hoy
            </FilterChip>
            <FilterChip active={activos.length === dias.length} onClick={() => setElegidos(dias)}>
              Mes
            </FilterChip>
            {dias.map((dia) => (
              <FilterChip key={dia} active={activos.includes(dia)} onClick={() => alternarDia(dia)}>
                {Number(dia.slice(8))}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label="Recaudo del filtro"
            value={<Money amount={total} />}
            hint={`${recaudo.reduce((a, r) => a + r.pagos, 0)} pagos conciliados`}
            tone="good"
          />
          <Kpi
            label="Carros sin pagar"
            value={carrosNoPagos}
            hint="Extracto de hoy todavía abierto"
            tone={carrosNoPagos > 0 ? "crit" : "good"}
          />
          <Kpi
            label="Plata que no entró"
            value={<Money amount={plataNoPagos} />}
            hint="Suma del extracto de esos carros"
            tone={plataNoPagos > 0.009 ? "crit" : "good"}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Tabla
            titulo="Por día"
            columnas={["Día", "Pagos", "Recaudo"]}
            filas={porDia.map((f) => [fechaConDia(f.fecha), String(f.pagos), f.monto])}
            vacio="No hay recaudo en esos días."
          />
          <Tabla
            titulo="Por empresa"
            columnas={["Empresa", "Pagos", "Recaudo"]}
            filas={porEmpresa
              .filter((f) => empresa === "todas" || f.codigo === empresa)
              .map((f) => [siglaEmpresa(f.codigo), String(f.pagos), f.monto])}
            vacio="No hay recaudo de esa empresa."
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Improductivos</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Improductivos" value={carrosImpro} hint="Improductivo, taller y colisión" tone={carrosImpro > 0 ? "warn" : "default"} />
          <Kpi
            label="Letra que no corre"
            value={<Money amount={letraImpro} />}
            hint="Cuota de hoy que esos carros no generan"
            tone={letraImpro > 0.009 ? "warn" : "default"}
          />
          <Kpi label="Por entregar" value={carrosEspera} hint="Todavía no salieron a la calle" />
        </div>
        {porEstado.length > 0 ? (
          <div className="mt-4">
            <Tabla
              titulo="Por estado"
              columnas={["Estado", "Carros", "Letra de hoy"]}
              filas={porEstado.map((f) => [ESTADO[f.estado] ?? f.estado, String(f.carros), f.letra])}
              vacio=""
            />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="No hay carros improductivos" hint="Chapistería, mantenimiento, colisión e improductivo aparecen aquí." />
          </div>
        )}
        {noPagos.length > 0 && (
          <div className="mt-4">
            <Tabla
              titulo="Sin pagar, por empresa"
              columnas={["Empresa", "Carros", "Extracto"]}
              filas={noPagos.map((f) => [siglaEmpresa(f.empresa), String(f.carros), f.monto])}
              vacio=""
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Entregas y devoluciones</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListaMovimiento titulo="Entregas" filas={entregas} />
          <ListaMovimiento titulo="Devoluciones" filas={devoluciones} />
        </div>
      </section>
    </div>
  );
}

function Tabla({
  titulo,
  columnas,
  filas,
  vacio,
}: {
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
  vacio: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <p className="px-4 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{titulo}</p>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{vacio}</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              {columnas.map((c) => (
                <th key={c} className="px-4 py-2 font-medium last:text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i} className="border-t border-line">
                {fila.map((celda, j) => (
                  <td key={j} className="px-4 py-3 last:text-right">
                    {typeof celda === "number" ? <Money amount={celda} /> : celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ListaMovimiento({
  titulo,
  filas,
}: {
  titulo: string;
  filas: PanelOperativo["movimientos"];
}) {
  const sedes = [...new Set(filas.map((f) => f.sucursal))];
  return (
    <div className="rounded-xl ring-1 ring-line">
      <p className="px-4 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {titulo} · {filas.length}
      </p>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Nada en los días elegidos.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sedes.map((sede) => (
            <li key={sede} className="px-4 py-3">
              <p className="text-sm font-medium">{sede}</p>
              <ul className="mt-1 space-y-1 text-sm text-muted">
                {filas
                  .filter((f) => f.sucursal === sede)
                  .map((f, i) => (
                    <li key={`${f.fecha}-${f.carro}-${i}`}>
                      {siglaEmpresa(f.empresa)} · {f.carro}
                      <span className="ml-2 text-xs">{fechaConDia(f.fecha)}</span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
