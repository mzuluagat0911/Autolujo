import { NextResponse } from "next/server";
import { listarCitas } from "@/lib/comercial/citas";
import { libroCitas } from "@/lib/comercial/citas-excel";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";

export const dynamic = "force-dynamic";

function sedeOk(valor: string | null): "juan_diaz" | "chorrera" | null {
  if (valor === "juan_diaz" || valor === "chorrera") return valor;
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sede = sedeOk(url.searchParams.get("sede"));
  const cuando = url.searchParams.get("cuando");
  const hoy = hoyPanama();
  const manana = sumarDias(hoy, 1);
  const { citas, error } = await listarCitas();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  const filas = citas.filter((cita) => {
    if (sede && cita.sede !== sede) return false;
    if (cuando === "hoy" && cita.fecha !== hoy) return false;
    if (cuando === "manana" && cita.fecha !== manana) return false;
    return true;
  });
  const libro = await libroCitas(filas);
  const marca = sede === "chorrera" ? "chorrera" : sede === "juan_diaz" ? "juan-diaz" : "todas";
  const dia = cuando === "hoy" || cuando === "manana" ? `-${cuando}` : "";
  return new NextResponse(new Uint8Array(libro), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="citas-${marca}${dia}.xlsx"`,
    },
  });
}
