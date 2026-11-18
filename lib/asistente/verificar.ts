// Cada cifra de la respuesta tiene que estar en lo que devolvieron las
// consultas, en la fecha de hoy o en las reglas fijas. Un monto ($) no se
// valida con lo que escribió el usuario: si no, "debe $500" se repite como cierto.

const NUM = /\$?\s?\d[\d.,]*\d|\$?\s?\d/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type Cifra = { n: number; dinero: boolean };

/** "$3,349.20" → 3349.2 · "6.000" → 6000 · "100.000" → 100000 · "33" → 33. */
export function aNumero(raw: string): number | null {
  let s = raw.replace(/[$\s]/g, "");
  if (!s) return null;
  const ultimoPunto = s.lastIndexOf(".");
  const ultimaComa = s.lastIndexOf(",");
  const sep = Math.max(ultimoPunto, ultimaComa);
  if (sep >= 0) {
    const decimales = s.length - sep - 1;
    const esDecimal = decimales > 0 && decimales <= 2;
    const entero = s.slice(0, sep).replace(/[.,]/g, "");
    s = esDecimal ? `${entero}.${s.slice(sep + 1)}` : s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function cifrasDe(texto: string): Cifra[] {
  const out: Cifra[] = [];
  for (const m of texto.matchAll(NUM)) {
    const n = aNumero(m[0]);
    if (n != null) out.push({ n, dinero: m[0].includes("$") });
  }
  return out;
}

export function numerosDe(texto: string): number[] {
  return cifrasDe(texto).map((c) => c.n);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cifras de la respuesta que no salen de ninguna fuente. Las chicas (≤ 10) no cuentan.
 * La suma o la resta de dos cifras que devolvió una consulta sí vale.
 */
export function cifrasSinFuente(
  respuesta: string,
  fuentes: { sistema: string; usuario: string[]; datos: string[] },
): number[] {
  const datos = fuentes.datos.map((d) => d.replace(UUID, ""));
  const deSistema = new Set(numerosDe(fuentes.sistema.replace(UUID, "")));
  const deUsuario = new Set(fuentes.usuario.flatMap(numerosDe));
  const deDatosSet = new Set(datos.flatMap(numerosDe));
  const deDatos = [...deDatosSet].filter((n) => Math.abs(n) > 0.009).slice(0, 300);
  const combinada = (n: number) => {
    for (let i = 0; i < deDatos.length; i++) {
      for (let j = i; j < deDatos.length; j++) {
        if (r2(deDatos[i] + deDatos[j]) === n || r2(Math.abs(deDatos[i] - deDatos[j])) === n) return true;
      }
    }
    return false;
  };
  const sueltas = new Set<number>();
  for (const { n, dinero } of cifrasDe(respuesta)) {
    if (Math.abs(n) <= 10) continue;
    if (deDatosSet.has(n) || deSistema.has(n) || combinada(n)) continue;
    if (!dinero && deUsuario.has(n)) continue;
    sueltas.add(n);
  }
  return [...sueltas];
}
