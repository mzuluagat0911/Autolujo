// Si preguntan el Panapass, Lucía solo recibe el número del carro nombrado.
// No va la flota entera en cada mensaje.

import { etiquetaCarroUi, siglaEmpresa } from "@/lib/cartera/empresa";
import { normalizarTelefono } from "@/lib/cartera/telefono";
import { createServerSupabase } from "@/lib/supabase/server";

export function preguntaPanapass(texto: string): boolean {
  return /pana\s*-?\s*pass/i.test(texto);
}

type Carro = {
  numero: string;
  placa: string;
  panapass: string;
  empresa: string;
};

function compacto(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nombraCarro(carro: Carro, pedido: string): boolean {
  const sigla = siglaEmpresa(carro.empresa);
  const n = carro.numero.toUpperCase().replace(/\s+/g, "");
  if (!n) return false;
  const aliases = [sigla];
  if (sigla === "GD") aliases.push("GOLD");
  if (sigla === "AL") aliases.push("AUTOLUJO");
  if (sigla === "KW") aliases.push("KOWUA", "KOWÜA");
  return aliases.some((a) => {
    if (!a) return false;
    const re = new RegExp(`\\b${a}\\s*[-·.]?\\s*${n}\\b`, "i");
    return re.test(pedido) || compacto(pedido).includes(`${a}${n}`);
  });
}

function linea(c: Carro): string {
  const quien = `${etiquetaCarroUi(c.empresa, c.numero)}${c.placa ? `, placa ${c.placa}` : ""}`;
  if (!c.panapass) return `- ${quien}: NO ESTÁ CARGADO.`;
  return `- ${quien}: ${c.panapass}`;
}

export async function notaPanapass(texto: string, wa: string | null): Promise<string> {
  if (!preguntaPanapass(texto)) return "";
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("numero, placa, panapass, empresa:empresas(codigo)");
  if (error) return "PANAPASS: no pude leer el número. No inventes uno. Dile que en la visita se lo confirman.";

  const carros: Carro[] = ((data ?? []) as unknown as {
    numero: string;
    placa: string | null;
    panapass: string | null;
    empresa: { codigo: string } | { codigo: string }[] | null;
  }[]).map((v) => {
    const emp = Array.isArray(v.empresa) ? v.empresa[0]?.codigo : v.empresa?.codigo;
    return {
      numero: v.numero ?? "",
      placa: compacto(v.placa ?? ""),
      panapass: String(v.panapass ?? "").trim(),
      empresa: emp ?? "",
    };
  });

  const pedido = texto.toUpperCase();
  const bolsa = compacto(pedido);
  const porPlaca = carros.filter((c) => c.placa.length >= 5 && bolsa.includes(c.placa));
  const porNombre = carros.filter((c) => nombraCarro(c, pedido));
  const vistos = new Set<string>();
  const elegidos: Carro[] = [];
  for (const c of [...porPlaca, ...porNombre]) {
    const clave = `${c.empresa}:${c.numero}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    elegidos.push(c);
  }

  if (elegidos.length === 0) {
    const canon = normalizarTelefono(wa);
    const sufijo = canon?.slice(-8);
    if (sufijo) {
      const { data: gente } = await sb
        .from("clientes")
        .select("id, whatsapp, telefono")
        .or(`whatsapp.ilike.%${sufijo},telefono.ilike.%${sufijo}`)
        .limit(8);
      const cliente = ((gente ?? []) as { id: string; whatsapp: string | null; telefono: string | null }[]).find(
        (c) => normalizarTelefono(c.whatsapp) === canon || normalizarTelefono(c.telefono) === canon,
      );
      if (cliente) {
        const { data: contratos } = await sb
          .from("contratos")
          .select("vehiculo:vehiculos(numero, placa, panapass, empresa:empresas(codigo))")
          .eq("cliente_id", cliente.id)
          .eq("estado", "activo")
          .limit(1);
        const row = (contratos ?? [])[0] as unknown as
          | {
              vehiculo: {
                numero: string;
                placa: string | null;
                panapass: string | null;
                empresa: { codigo: string } | { codigo: string }[] | null;
              } | null;
            }
          | undefined;
        const v = row?.vehiculo;
        if (v) {
          const emp = Array.isArray(v.empresa) ? v.empresa[0]?.codigo : v.empresa?.codigo;
          elegidos.push({
            numero: v.numero ?? "",
            placa: compacto(v.placa ?? ""),
            panapass: String(v.panapass ?? "").trim(),
            empresa: emp ?? "",
          });
        }
      }
    }
  }

  if (elegidos.length === 0) {
    return [
      "PANAPASS PEDIDO:",
      "No nombró un carro de la flota y este chat no está amarrado a un contrato.",
      "No inventes un número. Pregunta la placa o el número del carro y deja la visita.",
    ].join("\n");
  }

  return [
    "PANAPASS PEDIDO (solo estos; no menciones otros):",
    ...elegidos.map(linea),
    "Si el número está, dilo tal cual y sin signo $. No es un cobro. Si dice NO ESTÁ CARGADO, no lo inventes: en la visita se lo confirman.",
  ].join("\n");
}
