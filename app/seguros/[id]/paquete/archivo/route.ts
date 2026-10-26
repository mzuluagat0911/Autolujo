import { NextResponse } from "next/server";
import { puedeVerRuta } from "@/lib/equipo/modulos";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { empresaDeVehiculo, leerCaso, pathEmpresa, registroDeVehiculo, registroTieneDatos } from "@/lib/seguros/datos";
import { armarPaquetePdf, type ArchivoPaquete } from "@/lib/seguros/paquete-pdf";
import { empresaEnHoja, type Papeles } from "@/lib/seguros/portada";
import type { DocTipo, DocumentoCaso } from "@/lib/seguros/modelo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "comprobantes";

async function bajar(path: string): Promise<Uint8Array | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return bytes.byteLength ? bytes : null;
}

function meter(destino: ArchivoPaquete[], docs: DocumentoCaso[], bajados: Map<string, Uint8Array>) {
  for (const doc of docs) {
    const bytes = bajados.get(doc.path);
    if (bytes) destino.push({ nombre: doc.nombre || doc.tipo, bytes });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await sesionEquipo();
  if (!sesion || !puedeVerRuta(sesion.modulos, "/seguros")) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const { id } = await ctx.params;
  const fila = await leerCaso(id);
  if (!fila) return new NextResponse("No encuentro el caso", { status: 404 });

  const [empresa, registro] = await Promise.all([
    empresaDeVehiculo(fila.vehiculoId),
    registroDeVehiculo(fila.vehiculoId),
  ]);
  const paths = [...new Set(fila.caso.documentos.map((d) => d.path))];
  if (empresa) {
    paths.push(pathEmpresa(empresa.id, "representante"), pathEmpresa(empresa.id, "registro"));
  }
  const bajados = new Map<string, Uint8Array>();
  await Promise.all(
    paths.map(async (path) => {
      const bytes = await bajar(path);
      if (bytes) bajados.set(path, bytes);
    }),
  );

  const hay = (tipo: DocTipo) => fila.caso.documentos.some((d) => d.tipo === tipo && bajados.has(d.path));
  const representante = empresa ? bajados.get(pathEmpresa(empresa.id, "representante")) : undefined;
  const registroPublico = empresa ? bajados.get(pathEmpresa(empresa.id, "registro")) : undefined;
  const papeles: Papeles = {
    factura: hay("cotizacion"),
    cotizacion: fila.caso.piezas.length > 0 || hay("cotizacion"),
    cedulaLicencia: hay("cedula") || hay("licencia"),
    representante: Boolean(representante),
    registroVehiculo: registroTieneDatos(registro),
    informe: hay("fud") || hay("parte"),
    registroPublico: Boolean(registroPublico),
    resolucion: hay("resolucion"),
    fotoDano: hay("foto_dano"),
    fotoArreglo: hay("foto_reparado"),
  };

  const de = (tipo: DocTipo) => fila.caso.documentos.filter((d) => d.tipo === tipo);
  const archivos: ArchivoPaquete[] = [];
  meter(archivos, de("cotizacion"), bajados);
  meter(archivos, de("cedula"), bajados);
  meter(archivos, de("licencia"), bajados);
  if (representante) archivos.push({ nombre: "Cedula del representante", bytes: representante });
  meter(archivos, de("fud"), bajados);
  meter(archivos, de("parte"), bajados);
  if (registroPublico) archivos.push({ nombre: "Registro publico", bytes: registroPublico });
  meter(archivos, de("resolucion"), bajados);
  meter(archivos, de("foto_dano"), bajados);
  meter(archivos, de("foto_reparado"), bajados);
  meter(archivos, de("finiquito"), bajados);

  const pdf = await armarPaquetePdf({
    empresa: fila.empresa,
    numero: fila.numero,
    placa: fila.placa,
    marca: fila.marca,
    modelo: fila.modelo,
    fecha: fila.fecha,
    caso: fila.caso,
    papeles,
    registro: registroTieneDatos(registro) ? registro : null,
    archivos,
  });

  const nombre = `paquete-${empresaEnHoja(fila.empresa)}-${fila.numero}`
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}.pdf"`,
    },
  });
}
