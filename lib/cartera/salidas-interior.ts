// Tarifas de salida al interior CON permiso. El pago es PREVIO: no es la
// cuota del día ni la multa 127 (salir sin permiso). Fuente: tabla del equipo.

export type DestinoInterior = {
  id: string;
  nombre: string;
  monto: number;
  aliases: string[];
};

export const TARIFAS_SALIDA_INTERIOR: DestinoInterior[] = [
  { id: "penonome", nombre: "Penonomé", monto: 25, aliases: ["penonome", "penonomé"] },
  { id: "aguadulce", nombre: "Aguadulce", monto: 25, aliases: ["aguadulce"] },
  { id: "santiago", nombre: "Santiago", monto: 45, aliases: ["santiago"] },
  { id: "chitre", nombre: "Chitré", monto: 45, aliases: ["chitre", "chitré"] },
  { id: "las_tablas", nombre: "Las Tablas", monto: 60, aliases: ["las tablas", "tablas"] },
  { id: "chiriqui", nombre: "Chiriquí", monto: 121, aliases: ["chiriqui", "chiriquí"] },
  { id: "david", nombre: "David", monto: 127, aliases: ["david"] },
];

const CONTEXTO_SALIDA =
  /\b(interior|permiso|salida|viaj|voy para|voy pa\b|voy a|irme a|ir a|me voy|autoriz|aval)\b/i;

export function foldTexto(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function esContextoSalidaInterior(texto: string): boolean {
  return CONTEXTO_SALIDA.test(foldTexto(texto));
}

function matchDestinoEn(t: string): DestinoInterior | null {
  const hits: { d: DestinoInterior; i: number; n: number }[] = [];
  for (const d of TARIFAS_SALIDA_INTERIOR) {
    for (const a of d.aliases) {
      const i = t.indexOf(foldTexto(a));
      if (i >= 0) hits.push({ d, i, n: a.length });
    }
  }
  if (hits.length === 0) return null;
  // David gana sobre Chiriquí si salen los dos. Si no, el alias más largo.
  const david = hits.find((h) => h.d.id === "david");
  if (david) return david.d;
  hits.sort((a, b) => b.n - a.n || a.i - b.i);
  return hits[0].d;
}

/** Destino solo si el mensaje habla de salir / interior / permiso (evita “llamen a Santiago”). */
export function detectarDestinoInterior(texto: string): DestinoInterior | null {
  const t = foldTexto(texto);
  const dest = matchDestinoEn(t);
  if (!dest) return null;
  if (!esContextoSalidaInterior(t)) return null;
  return dest;
}

export function detectarDestinoEnTextos(textos: string[]): DestinoInterior | null {
  for (let i = textos.length - 1; i >= 0; i--) {
    const d = detectarDestinoInterior(textos[i] ?? "");
    if (d) return d;
  }
  const junto = textos.join("\n");
  return detectarDestinoInterior(junto);
}

export const DESTINO_OTRO_ID = "otro";

export function destinoPorId(id: string): DestinoInterior | null {
  return TARIFAS_SALIDA_INTERIOR.find((d) => d.id === id) ?? null;
}

export function destinoLibre(nombre: string, monto: number): DestinoInterior {
  const n = nombre.trim() || "Otro destino";
  return { id: DESTINO_OTRO_ID, nombre: n, monto: Math.round(monto * 100) / 100, aliases: [] };
}

export function detectarDiasViaje(textos: string[]): number | null {
  const t = foldTexto(textos.join(" "));
  const m = /(\d{1,2})\s*d[ií]as?/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 2 || n > 14) return null;
  return n;
}

export function destinoPorNombre(nombre: string): DestinoInterior | null {
  const t = foldTexto(nombre);
  return TARIFAS_SALIDA_INTERIOR.find((d) => foldTexto(d.nombre) === t || d.aliases.some((a) => foldTexto(a) === t)) ?? null;
}

/** Si ya hay contexto de salida y el monto casa con UNA sola tarifa. */
export function inferirDestinoPorMonto(monto: number, textos: string[]): DestinoInterior | null {
  const porNombre = detectarDestinoEnTextos(textos);
  if (porNombre) return porNombre;
  const hay = textos.some((x) => esContextoSalidaInterior(x));
  if (!hay || !Number.isFinite(monto)) return null;
  const hits = TARIFAS_SALIDA_INTERIOR.filter((d) => Math.abs(d.monto - monto) < 0.02);
  return hits.length === 1 ? hits[0] : null;
}

export function partirMontoInterior(
  monto: number,
  tarifa: number,
): { interior: number; resto: number } {
  const m = Math.round(monto * 100) / 100;
  const t = Math.round(tarifa * 100) / 100;
  if (m <= t + 0.009) return { interior: m, resto: 0 };
  return { interior: t, resto: Math.round((m - t) * 100) / 100 };
}

export function textoTarifasInterior(): string {
  const filas = TARIFAS_SALIDA_INTERIOR.map((d) => `- ${d.nombre}: $${d.monto}`).join("\n");
  return [
    `SALIDAS AL INTERIOR AUTORIZADAS (pago PREVIO; este dinero NO es la cuota del día):`,
    filas,
    `- El cliente paga ANTES, se asigna al rubro "salida al interior" y el equipo da el aval.`,
    `- Sin ese pago no hay permiso. Si pide un destino que NO está en la lista, o un viaje de MÁS DE UN DÍA: no inventes tarifa ni fechas; dile que el equipo le cotiza y marca pasar_a_humano = true.`,
    `- Salir SIN permiso es OTRA cosa (multa 127), no estas tarifas.`,
  ].join("\n");
}
