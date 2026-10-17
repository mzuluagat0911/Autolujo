/** Huella estable de la bandeja. Si no cambia, el poll no manda las filas. */

export type MarcaPulso = {
  id: string;
  ultimo_texto: string | null;
  ultimo_mensaje_at: string | null;
  no_leidos: number;
  estado: string;
  modo: string;
  necesita_humano: boolean;
  motivo_escalada: string | null;
  ultimo_entrante_at: string | null;
};

export function huellaBandeja(filas: MarcaPulso[]): string {
  let h = 5381;
  for (const f of filas) {
    const s = [
      f.id,
      f.ultimo_mensaje_at ?? "",
      f.ultimo_texto ?? "",
      f.no_leidos,
      f.modo,
      f.necesita_humano ? "1" : "0",
      f.estado,
      f.motivo_escalada ?? "",
      f.ultimo_entrante_at ?? "",
    ].join("|");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return `${filas.length}:${h >>> 0}`;
}
