import { NextResponse } from "next/server";
import { puedeVerRuta } from "@/lib/equipo/modulos";
import { sesionEquipo } from "@/lib/equipo/sesion";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await sesionEquipo();
  if (!sesion || !puedeVerRuta(sesion.modulos, "/seguros")) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse("No encuentro el registro", { status: 404 });

  const src = `/seguros/registros/${id}/archivo`;
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Registro vehicular</title>
  <style>
    html, body { margin: 0; height: 100%; background: #fff; }
    iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <iframe id="registro" src="${src}"></iframe>
  <script>
    var marco = document.getElementById("registro");
    marco.addEventListener("load", function () {
      setTimeout(function () {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); }
        catch (e) { window.print(); }
      }, 500);
    });
  </script>
</body>
</html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
