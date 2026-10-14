const MARCA = /\[archivo:([^\]]+)\]/;

/** El path queda en el texto para que el equipo vea la foto sin una columna nueva. */
export function textoConArchivo(visible: string, path: string | null): string {
  const limpio = visible.trim();
  if (!path) return limpio;
  return `${limpio}\n[archivo:${path}]`;
}

export function partirArchivo(texto: string | null): { texto: string | null; archivo: string | null } {
  if (!texto) return { texto, archivo: null };
  const marca = MARCA.exec(texto);
  if (!marca) return { texto, archivo: null };
  const visible = texto.replace(marca[0], "").trim();
  return { texto: visible || null, archivo: marca[1] ?? null };
}
