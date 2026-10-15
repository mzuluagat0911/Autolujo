/** Referencias del contrato: mínimo 4, máximo 10. Cada una lleva nombre, parentesco y teléfono. */

export const REFERENCIAS_MIN = 4;
export const REFERENCIAS_MAX = 10;

export type ReferenciasAlta = { texto: string | null; error: string | null };

function limpio(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export function referenciasPersonales(form: FormData): ReferenciasAlta {
  const lineas: string[] = [];
  for (let i = 1; i <= REFERENCIAS_MAX; i++) {
    const nombre = limpio(form.get(`ref_nombre_${i}`));
    const parentesco = limpio(form.get(`ref_parentesco_${i}`));
    const telefono = limpio(form.get(`ref_telefono_${i}`));
    if (!nombre && !parentesco && !telefono) continue;
    if (!nombre || !parentesco || !telefono) {
      return {
        texto: null,
        error: `La referencia ${i} necesita nombre, parentesco y teléfono.`,
      };
    }
    lineas.push(`${lineas.length + 1}. ${nombre} — ${parentesco} — ${telefono}`);
  }
  if (lineas.length < REFERENCIAS_MIN) {
    return {
      texto: null,
      error: "Hacen falta 4 referencias completas para guardar el contrato.",
    };
  }
  return { texto: lineas.join("\n"), error: null };
}
