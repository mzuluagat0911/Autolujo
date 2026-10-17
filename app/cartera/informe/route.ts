import { NextResponse } from "next/server";
import { archivoInforme } from "@/lib/cartera/informe-cargar";
import { hoyPanama } from "@/lib/cartera/fecha";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fecha = new URL(req.url).searchParams.get("fecha")?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Indica la fecha del informe." }, { status: 400 });
  }
  if (fecha > hoyPanama()) {
    return NextResponse.json({ error: "La fecha no puede ser posterior a hoy." }, { status: 400 });
  }
  try {
    const archivo = await archivoInforme(fecha);
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="informe-${fecha}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No pude armar el informe.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
