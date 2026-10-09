// Lo que se puede ofrecer: carros en estado por entregar.
// La ficha con fotos llega cuando definan los criterios. Hasta entonces no se manda foto.

import { createServerSupabase } from "@/lib/supabase/server";

type ContratoMini = { estado: string; letra_diaria: number | null; fecha_inicio: string | null };

function letraDe(contratos: ContratoMini[]): number | null {
  const activo = contratos.find((c) => c.estado === "activo" && c.letra_diaria != null);
  if (activo?.letra_diaria != null) return Number(activo.letra_diaria);
  const ordenados = [...contratos].sort((a, b) => (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""));
  const letra = ordenados.find((c) => c.letra_diaria != null)?.letra_diaria;
  return letra == null ? null : Number(letra);
}

export async function textoInventario(): Promise<string> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("numero, marca, modelo, anio, contratos(estado, letra_diaria, fecha_inicio)")
    .eq("estado", "por_entregar")
    .order("numero");
  if (error) return "DISPONIBLES: no pude leer el inventario. No inventes carros.";
  const filas = (data ?? []) as {
    numero: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    contratos: ContratoMini[] | null;
  }[];
  if (filas.length === 0) {
    return "DISPONIBLES: ahora no hay carros por entregar. No inventes uno. Invítalo a la visita y dile que la disponibilidad se confirma ahí.";
  }
  const lineas = filas.map((v) => {
    const nombre = [v.marca, v.modelo].filter(Boolean).join(" ") || "sedán";
    const anio = v.anio ?? "año por confirmar";
    const letra = letraDe(v.contratos ?? []);
    const precio = letra != null ? `letra $${Math.round(letra)}` : "letra según el carro, entre $25 y $35";
    return `- ${v.numero}: ${nombre} ${anio}, ${precio}`;
  });
  return [
    "DISPONIBLES (estado por entregar; solo estos se pueden ofrecer):",
    ...lineas,
    "Si preguntan por otro modelo que no está en esta lista, no lo ofrezcas: dile que está sujeto a lo que haya en sede.",
    "Todavía no hay fotos cargadas. No prometas ni describas una foto.",
  ].join("\n");
}
