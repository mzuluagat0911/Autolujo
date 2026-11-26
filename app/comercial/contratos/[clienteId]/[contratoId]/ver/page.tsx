import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimirContrato } from "@/app/comercial/contratos/imprimir";
import { documentoDeContrato } from "@/lib/cartera/contrato-descarga";
import { htmlDeDocxContrato } from "@/lib/cartera/contrato-original";

export const dynamic = "force-dynamic";

export default async function VerContratoComercialPage({
  params,
}: {
  params: Promise<{ clienteId: string; contratoId: string }>;
}) {
  const { clienteId, contratoId } = await params;
  const doc = await documentoDeContrato(clienteId, contratoId);
  if (!doc.ok) notFound();
  const html = htmlDeDocxContrato(doc.docx);

  return (
    <div className="mx-auto w-[8.5in] max-w-full py-8 print:w-auto print:max-w-none print:py-0">
      <style>{`
        @page { size: 8.5in 14in; margin: 1in 1.25in; }
        .contrato-hoja { font-family: "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.15; }
        .contrato-hoja p { margin: 0; }
        .contrato-hoja .corte { margin: 1.75rem 0; border: 0; border-top: 1px dashed #d1d5db; }
        @media print {
          .contrato-hoja { width: auto; min-height: 0; }
          .contrato-hoja .corte { border: 0; margin: 0; break-before: page; }
        }
      `}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/comercial/contratos" className="text-sm text-muted hover:text-ink hover:underline">
          ← Contratos aprobados
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/comercial/contratos/${clienteId}/${contratoId}`}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Descargar Word
          </a>
          <BotonImprimirContrato />
        </div>
      </div>
      <p className="mb-4 text-sm text-muted print:hidden">
        Contrato {doc.etiqueta}. Misma hoja que usa Cartera.
      </p>
      <article
        className="contrato-hoja mx-auto box-border min-h-[14in] w-full bg-white px-[1.25in] py-[1in] text-black ring-1 ring-line print:min-h-0 print:px-0 print:py-0 print:ring-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
