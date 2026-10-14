/** Celular legible. Panamá en 8 dígitos; el resto con su código de país. */
export function telefonoVisible(wa: string, celular: string | null): string {
  const raw = (celular || wa).replace(/\D/g, "");
  if (raw.startsWith("507") && raw.length === 11) {
    const d = raw.slice(3);
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  if (raw.startsWith("57") && raw.length === 12) {
    const d = raw.slice(2);
    return `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  if (raw.length > 8) return `+${raw}`;
  return celular || wa;
}

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
