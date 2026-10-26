import { NextResponse } from "next/server";
import { documentoDeContrato } from "@/lib/cartera/contrato-descarga";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; contratoId: string }> },
) {
  const { id, contratoId } = await ctx.params;
  const doc = await documentoDeContrato(id, contratoId);
  if (!doc.ok) return NextResponse.json({ error: doc.error }, { status: doc.status });
  return new NextResponse(new Uint8Array(doc.docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${doc.nombreArchivo}"`,
    },
  });
}
