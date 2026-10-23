import Link from "next/link";
import { notFound } from "next/navigation";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { empresaDeVehiculo, firmar, leerCaso, pathEmpresa, registroDeVehiculo, registroTieneDatos } from "@/lib/seguros/datos";
import { BloqueRegistro } from "../../registro";
import {
  DOCUMENTOS,
  fechaCorta,
  nombreAseguradora,
  totalPiezas,
} from "@/lib/seguros/modelo";

export const dynamic = "force-dynamic";

export default async function PaquetePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fila = await leerCaso(id);
  if (!fila) notFound();
  const [empresa, registro] = await Promise.all([
    empresaDeVehiculo(fila.vehiculoId),
    registroDeVehiculo(fila.vehiculoId),
  ]);
  const registroListo = registroTieneDatos(registro);
  const fijos = empresa
    ? [pathEmpresa(empresa.id, "registro"), pathEmpresa(empresa.id, "representante")]
    : [];
  const urls = await firmar([...fila.caso.documentos.map((d) => d.path), ...fijos]);
  const fotos = fila.caso.documentos.filter((d) => d.tipo === "foto_dano" || d.tipo === "foto_reparado");

  return (
    <div className="mx-auto max-w-3xl py-10 print:max-w-none print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/seguros/${id}`} className="text-sm text-muted hover:text-ink hover:underline">
          ← Volver al caso
        </Link>
        <p className="text-sm text-muted">Imprimí con el menú del navegador.</p>
      </div>

      <article className="rounded-xl bg-white p-8 ring-1 ring-line print:rounded-none print:p-0 print:ring-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Paquete de colisión</p>
        <h1 className="mt-2 text-2xl font-bold">
          {etiquetaCarroUi(fila.empresa, fila.numero)} · {fila.placa || "Sin placa"}
        </h1>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Dato k="Cliente" v={fila.caso.clienteNombre || "—"} />
          <Dato k="Fecha del choque" v={fechaCorta(fila.fecha)} />
          <Dato k="Lugar" v={fila.caso.lugar || "—"} />
          <Dato k="Aseguradora" v={nombreAseguradora(fila.caso.aseguradora) || "—"} />
          <Dato k="Camino" v={fila.caso.via === "parte" ? "Parte policivo" : fila.caso.via === "fud" ? "FUD" : "—"} />
          <Dato k="Número de parte" v={fila.caso.numeroParte || "—"} />
          <Dato k="Audiencia" v={fila.caso.fechaAudiencia ? `${fechaCorta(fila.caso.fechaAudiencia)} ${fila.caso.lugarAudiencia}` : "—"} />
          <Dato k="Reclamo" v={fila.caso.numeroReclamo || "—"} />
          <Dato k="Finiquito" v={fila.caso.montoFiniquito != null ? `USD ${fila.caso.montoFiniquito}` : "—"} />
          <Dato k="Kilometraje" v={fila.km != null ? String(fila.km) : "—"} />
        </dl>
        {fila.caso.relato && <p className="mt-6 text-sm">{fila.caso.relato}</p>}
        {fila.caso.observaciones && (
          <p className="mt-4 text-sm">
            <span className="font-medium">Notas. </span>
            {fila.caso.observaciones}
          </p>
        )}

        {fila.caso.piezas.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold">Piezas</h2>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 font-medium">Pieza</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {fila.caso.piezas.map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="py-2">
                      {p.pieza}
                      {p.extra ? " (extra)" : ""}
                    </td>
                    <td className="py-2">{p.condicion === "nueva" ? "Nueva" : "Reparar"}</td>
                    <td className="py-2 text-right tabular-nums">{p.precio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-right text-sm font-medium tabular-nums">Total USD {totalPiezas(fila.caso.piezas)}</p>
          </div>
        )}

        {registro && registroListo && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold">Registro vehicular</h2>
            <p className="mt-1 text-xs text-muted">Tomado de la ficha del carro.</p>
            <div className="mt-3">
              <BloqueRegistro registro={registro} />
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Documentos</h2>
          <ul className="mt-2 text-sm">
            {DOCUMENTOS.map((d) => {
              const n = fila.caso.documentos.filter((x) => x.tipo === d.id).length;
              const estado =
                d.id === "registro" && registroListo
                  ? "En el sistema"
                  : n > 0
                    ? `${n} archivo${n === 1 ? "" : "s"}`
                    : "Falta";
              return (
                <li key={d.id} className="flex justify-between border-b border-line py-1.5">
                  <span>{d.label}</span>
                  <span className="text-muted">{estado}</span>
                </li>
              );
            })}
            <li className="flex justify-between border-b border-line py-1.5">
              <span>Registro público de la empresa</span>
              <span className="text-muted">{empresa && urls[pathEmpresa(empresa.id, "registro")] ? "Adjunto" : "Falta"}</span>
            </li>
            <li className="flex justify-between border-b border-line py-1.5">
              <span>Documento del representante legal</span>
              <span className="text-muted">{empresa && urls[pathEmpresa(empresa.id, "representante")] ? "Adjunto" : "Falta"}</span>
            </li>
          </ul>
        </div>

        {fotos.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3">
            {fotos.map((f) =>
              urls[f.path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={urls[f.path]} alt={f.nombre} className="w-full rounded-lg ring-1 ring-line" />
              ) : null,
            )}
          </div>
        )}
      </article>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
