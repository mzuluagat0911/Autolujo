import { NextResponse } from "next/server";
import { archivoInforme } from "@/lib/cartera/informe-cargar";
import { diasEntre, hoyPanama } from "@/lib/cartera/fecha";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde")?.slice(0, 10) ?? "";
  const hasta = url.searchParams.get("hasta")?.slice(0, 10) ?? "";
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "Indica desde y hasta." }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha desde tiene que ser anterior o igual a hasta." }, { status: 400 });
  }
  if (hasta > hoyPanama()) {
    return NextResponse.json({ error: "La fecha hasta no puede ser posterior a hoy." }, { status: 400 });
  }
  if (diasEntre(desde, hasta) > 92) {
    return NextResponse.json({ error: "El rango puede ser de hasta 93 días." }, { status: 400 });
  }
  try {
    const archivo = await archivoInforme(desde, hasta);
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="informe-${desde}_${hasta}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No pude armar el informe.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
