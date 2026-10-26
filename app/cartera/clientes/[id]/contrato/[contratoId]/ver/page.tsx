import Link from "next/link";
import { notFound } from "next/navigation";
import { documentoDeContrato } from "@/lib/cartera/contrato-descarga";
import { htmlDeDocxContrato } from "@/lib/cartera/contrato-original";

export const dynamic = "force-dynamic";

export default async function VerContratoPage({
  params,
}: {
  params: Promise<{ id: string; contratoId: string }>;
}) {
  const { id, contratoId } = await params;
  const doc = await documentoDeContrato(id, contratoId);
  if (!doc.ok) notFound();
  const html = htmlDeDocxContrato(doc.docx);

  return (
    <div className="mx-auto max-w-4xl py-8 print:max-w-none print:py-0">
      <style>{`
        .contrato-hoja { font-family: "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.15; }
        .contrato-hoja p { margin: 0; }
        .contrato-hoja .corte { margin: 1.75rem 0; border: 0; border-top: 1px dashed #d1d5db; }
        @media print { .contrato-hoja .corte { border: 0; margin: 0; break-before: page; } }
      `}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/cartera/clientes/${id}`} className="text-sm text-muted hover:text-ink hover:underline">
          ← Volver al cliente
        </Link>
        <a
          href={`/cartera/clientes/${id}/contrato/${contratoId}`}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
        >
          Descargar Word
        </a>
      </div>
      <p className="mb-4 text-sm text-muted print:hidden">
        Contrato {doc.etiqueta}. Esta es la misma hoja que se descarga.
      </p>
      <article
        className="contrato-hoja bg-white px-5 py-8 text-black ring-1 ring-line sm:px-10 print:px-0 print:ring-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
