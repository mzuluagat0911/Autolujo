/** Un sí a la cita. Una pregunta de carros, llegada o requisitos no confirma. */
export function textoEsConfirmacion(texto: string): boolean {
  const t = texto.trim().toLowerCase().replace(/[!.,]+$/g, "");
  if (!t || t.length > 60) return false;
  if (/\?|llevar|llegar|carro|disponible|requisit|d[oó]nde|c[oó]mo|direcci[oó]n|mapa|hora|sede/.test(t)) return false;
  return /^(?:s[ií]|ok|okay|dale|confirmo|confirmad[oa]|listo|va|de acuerdo|perfecto|ah[ií] (?:voy|estar[eé]))(?:\s|$)/.test(t);
}

/** La cita ya está en ese día, hora, sede y nombre. No hace falta volver a confirmarla. */
export function pedidoRepiteCita(
  abierta: { sede: string; fecha: string; hora: string; nombre: string } | null,
  pedido: {
    accion: string;
    sede: string | null;
    fecha: string | null;
    hora: string | null;
    nombre: string | null;
  },
): boolean {
  if (!abierta) return false;
  if (pedido.accion !== "agendar" && pedido.accion !== "reagendar") return false;
  const sede = pedido.sede ?? abierta.sede;
  const fecha = pedido.fecha ?? abierta.fecha;
  const hora = pedido.hora ?? abierta.hora;
  const nombre = (pedido.nombre ?? abierta.nombre).trim().toLowerCase();
  return (
    sede === abierta.sede &&
    fecha === abierta.fecha &&
    hora === abierta.hora &&
    nombre === abierta.nombre.trim().toLowerCase()
  );
}
