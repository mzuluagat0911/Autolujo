import { notFound } from "next/navigation";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { DATOS_OFICINA, cargarRecibo, fechaRecibo } from "@/lib/cartera/recibo-caja";
import { ImprimirRecibo } from "./imprimir";

export const dynamic = "force-dynamic";

function dinero(n: number): string {
  return n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imprimir?: string }>;
}) {
  const { id } = await params;
  const { imprimir } = await searchParams;
  const equipo = await sesionEquipo();
  const recibo = await cargarRecibo(id, equipo?.nombre ?? "Oficina");
  if (!recibo) notFound();

  return (
    <div className="py-6">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          main { padding: 0 !important; }
          .recibo { width: 72mm; }
        }
      `}</style>
      <ImprimirRecibo auto={imprimir === "1"} />
      <article className="recibo mx-auto w-[72mm] bg-white px-1 py-2 font-sans text-[11px] leading-snug text-black">
        <header className="border-b border-black pb-2 text-center">
          <p className="text-sm font-bold tracking-wide">AutoLujo</p>
          <p className="text-[10px]">Cumple tu sueño</p>
        </header>
        <p className="mt-2">{DATOS_OFICINA.ciudad}</p>
        <p>{DATOS_OFICINA.direccion}</p>
        <p>{DATOS_OFICINA.telefono}</p>
        {recibo.correo && <p className="break-all">E-Mail: {recibo.correo}</p>}

        <p className="mt-2 font-bold">RECIBO N°: {recibo.numero}</p>
        <p>Fecha: {recibo.fechaPago}</p>
        <p className="mt-2">Empresa: {recibo.empresa}</p>
        <p>Nombre: {recibo.nombre}</p>
        <p>Cédula N°: {recibo.cedula}</p>
        <p>Placa N°: {recibo.placa}</p>
        <p>Unidad N°: {recibo.unidad}</p>
        <p className="mt-2">Forma Pago: {recibo.metodo}</p>
        <p className="mt-1 border border-black px-1 py-1 text-center text-sm font-bold">
          Pagado: {dinero(recibo.monto)}
        </p>

        <table className="mt-2 w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 font-bold">CONCEPTO</th>
              <th className="py-1 text-right font-bold">VALOR</th>
            </tr>
          </thead>
          <tbody>
            {recibo.lineas.map((l, i) => (
              <tr key={`${l.concepto}-${i}`} className="border-b border-black/30">
                <td className="py-1 pr-2 capitalize">{l.concepto}</td>
                <td className="py-1 text-right tabular-nums">{dinero(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {recibo.letra != null && recibo.letra > 0 && (
          <p className="mt-2 text-[10px] font-semibold">
            Abono inicial NO REEMBOLSABLE. Pagos diarios de ${dinero(recibo.letra)} antes de las 7pm.
          </p>
        )}

        <div className="mt-6 border-t border-black pt-1 text-center text-[10px]">
          <p className="font-semibold uppercase">{recibo.atendio}</p>
          <p>Firma y cédula · Usuario</p>
        </div>
        <p className="mt-3 text-center text-[10px] font-semibold">¡Gracias por mantener su cuenta al día!</p>
        <p className="text-center text-[10px]">Impreso: {fechaRecibo(new Date().toISOString())}</p>
      </article>
    </div>
  );
}
