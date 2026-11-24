import { NextResponse } from "next/server";
import { archivoExtractoCliente } from "@/lib/cartera/extracto-cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; contratoId: string }> },
) {
  const { id, contratoId } = await ctx.params;
  const doc = await archivoExtractoCliente(id, contratoId);
  if (!doc.ok) {
    return NextResponse.json({ error: doc.error }, { status: doc.status });
  }
  return new NextResponse(new Uint8Array(doc.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${doc.nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
