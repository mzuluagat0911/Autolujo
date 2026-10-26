import Link from "next/link";
import { notFound } from "next/navigation";
import { empresaDeVehiculo, firmar, leerCaso, pathEmpresa, registroDeVehiculo, registroTieneDatos } from "@/lib/seguros/datos";
import { totalPiezas } from "@/lib/seguros/modelo";
import { hojaAmarilla, type Papeles } from "@/lib/seguros/portada";
import { plata } from "@/lib/seguros/tarifas";

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
  const hay = (tipo: string) => fila.caso.documentos.some((d) => d.tipo === tipo && urls[d.path]);
  const papeles: Papeles = {
    factura: hay("cotizacion"),
    cotizacion: fila.caso.piezas.length > 0 || hay("cotizacion"),
    cedulaLicencia: hay("cedula") || hay("licencia"),
    representante: Boolean(empresa && urls[pathEmpresa(empresa.id, "representante")]),
    registroVehiculo: registroListo,
    informe: hay("fud") || hay("parte"),
    registroPublico: Boolean(empresa && urls[pathEmpresa(empresa.id, "registro")]),
    resolucion: hay("resolucion"),
    fotoDano: hay("foto_dano"),
    fotoArreglo: hay("foto_reparado"),
  };
  const hoja = hojaAmarilla({
    empresa: fila.empresa,
    numero: fila.numero,
    placa: fila.placa,
    marca: fila.marca,
    modelo: fila.modelo,
    fecha: fila.fecha,
    caso: fila.caso,
    papeles,
  });

  return (
    <div className="mx-auto max-w-4xl py-8 print:max-w-none print:py-0">
      <style>{`@media print { .hoja-amarilla { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/seguros/${id}`} className="text-sm text-muted hover:text-ink hover:underline">
          ← Volver al caso
        </Link>
        <a
          href={`/seguros/${id}/paquete/archivo`}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
        >
          Descargar paquete
        </a>
      </div>
      <p className="mb-4 text-sm text-muted print:hidden">
        La hoja amarilla es la portada. El PDF le suma la cotización, el registro del carro y los papeles cargados en el caso.
      </p>

      <article className="hoja-amarilla bg-[#ffe566] p-5 text-black sm:p-8">
        <h1 className="text-center text-lg font-bold tracking-wide">RECLAMOS ASEGURADORA</h1>
        <table className="mt-4 w-full border-collapse text-xs">
          <tbody>
            <tr>
              <th className="border border-black px-2 py-1.5 text-left font-semibold">EMPRESA</th>
              <td className="border border-black px-2 py-1.5">{hoja.empresa}</td>
              <th className="border border-black px-2 py-1.5 text-left font-semibold">CARRO #</th>
              <td className="border border-black px-2 py-1.5">{hoja.numero}</td>
              <th className="border border-black px-2 py-1.5 text-left font-semibold">SEGURO</th>
              <td className="border border-black px-2 py-1.5">{hoja.seguro}</td>
            </tr>
            {hoja.filas.map((filaHoja) => (
              <tr key={filaHoja.etiqueta}>
                <th className="border border-black px-2 py-1.5 text-left font-semibold">{filaHoja.etiqueta}</th>
                <td className="border border-black px-2 py-1.5">{filaHoja.valor}</td>
                <th className="border border-black px-2 py-1.5 text-left font-semibold">{filaHoja.documento}</th>
                <td className="border border-black px-2 py-1.5" colSpan={3}>
                  {filaHoja.marca}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs font-semibold">OBSERVACIONES</p>
        <p className="mt-1 min-h-8 text-sm">{hoja.observaciones}</p>
        <p className="mt-4 text-sm font-semibold">{hoja.danos || "DAÑOS."}</p>
      </article>

      {fila.caso.piezas.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Cotización</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2 font-medium">Pieza</th>
                <th className="py-2 text-right font-medium">Con descuento</th>
                <th className="py-2 text-right font-medium">Mano de obra</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {fila.caso.piezas.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2">
                    {p.pieza}
                    {p.extra ? " (extra)" : ""}
                  </td>
                  <td className="py-2 text-right tabular-nums">{typeof p.precioPieza === "number" ? plata(p.precioPieza) : ""}</td>
                  <td className="py-2 text-right tabular-nums">{typeof p.manoObra === "number" ? plata(p.manoObra) : ""}</td>
                  <td className="py-2 text-right tabular-nums">{plata(p.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-sm font-medium tabular-nums">Total USD {plata(totalPiezas(fila.caso.piezas))}</p>
        </section>
      )}
    </div>
  );
}
