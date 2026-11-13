import { NextResponse } from "next/server";
import { puedeVerRuta } from "@/lib/equipo/modulos";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { pathVehiculo } from "@/lib/seguros/datos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "comprobantes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tipoDe(bytes: Uint8Array, declarado: string): string {
  if (declarado && declarado !== "application/octet-stream") return declarado;
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return "image/webp";
  }
  return declarado || "application/octet-stream";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await sesionEquipo();
  if (!sesion || !puedeVerRuta(sesion.modulos, "/seguros")) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse("No encuentro el registro", { status: 404 });

  const sb = createServerSupabase();
  const { data, error } = await sb.storage.from(BUCKET).download(pathVehiculo(id, "registro"));
  if (error || !data) return new NextResponse("No hay registro de este carro.", { status: 404 });
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!bytes.byteLength) return new NextResponse("No hay registro de este carro.", { status: 404 });
  const tipo = tipoDe(bytes, data.type || "");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": 'inline; filename="registro-vehicular"',
      "Cache-Control": "private, no-store",
    },
  });
}
