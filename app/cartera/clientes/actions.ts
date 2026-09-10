"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { normalizarGenero } from "@/lib/cartera/tratamiento";
import { etiquetaCarroUi, siglaEmpresa } from "@/lib/cartera/empresa";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createCliente(formData: FormData): Promise<void> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio.");
  const genero = normalizarGenero(formData.get("genero"));
  if (!genero) throw new Error("Indicá el género (Sr. / Sra.) para saludar bien por WhatsApp.");

  const sb = createServerSupabase();
  const { error } = await sb.from("clientes").insert({
    nombre,
    genero,
    cedula: str(formData.get("cedula")),
    telefono: str(formData.get("telefono")),
    whatsapp: str(formData.get("whatsapp")),
    mayor_de_25: formData.get("mayor_de_25") === "on",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/clientes");
}

/**
 * Alta en un paso: cliente + contrato activo sobre un carro libre.
 * El carro pasa a “activo” y queda enlazado en la plataforma.
 */
export async function createClienteConContrato(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const genero = normalizarGenero(formData.get("genero"));
  if (!genero) return { ok: false, error: "Indicá el género (Sr. / Sra.)." };

  const vehiculoId = String(formData.get("vehiculo_id") ?? "").trim();
  if (!vehiculoId) return { ok: false, error: "Elegí el carro." };

  const letra = num(formData.get("letra_diaria"));
  if (letra == null || letra <= 0) return { ok: false, error: "La letra diaria es obligatoria." };

  const numCuotas = num(formData.get("num_cuotas_total"));
  const abono = num(formData.get("abono_inicial")) ?? 0;
  const descuento = num(formData.get("descuento_puntual"));
  const cobraDomingo = formData.get("cobra_domingo") === "on";
  const cuotaDomingo = num(formData.get("cuota_domingo")) ?? 0;
  const fechaInicio = str(formData.get("fecha_inicio")) ?? hoyPanama();

  const sb = createServerSupabase();

  const { data: veh, error: vErr } = await sb
    .from("vehiculos")
    .select("id, empresa_id, numero, estado, empresa:empresas(codigo)")
    .eq("id", vehiculoId)
    .maybeSingle();
  if (vErr || !veh) return { ok: false, error: "No encontré ese carro." };

  const { data: activo } = await sb
    .from("contratos")
    .select("id")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .limit(1)
    .maybeSingle();
  if (activo) return { ok: false, error: "Ese carro ya tiene un contrato activo." };

  const { data: cliente, error: cErr } = await sb
    .from("clientes")
    .insert({
      nombre,
      genero,
      cedula: str(formData.get("cedula")),
      telefono: str(formData.get("telefono")),
      whatsapp: str(formData.get("whatsapp")),
      mayor_de_25: formData.get("mayor_de_25") === "on",
      codigo: str(formData.get("codigo")),
    })
    .select("id")
    .single();
  if (cErr || !cliente) {
    return { ok: false, error: cErr?.message ?? "No pude crear el cliente." };
  }

  const { data: contrato, error: ctErr } = await sb
    .from("contratos")
    .insert({
      cliente_id: cliente.id,
      vehiculo_id: vehiculoId,
      empresa_id: (veh as { empresa_id: string }).empresa_id,
      fecha_inicio: fechaInicio,
      letra_diaria: letra,
      num_cuotas_total: numCuotas != null && numCuotas > 0 ? Math.round(numCuotas) : null,
      abono_inicial: abono,
      saldo_inicial: 0,
      estado: "activo",
      descuento_puntual: descuento != null && descuento >= 0 ? descuento : 5,
      cobra_domingo: cobraDomingo,
      cuota_domingo: cobraDomingo ? cuotaDomingo : 0,
    })
    .select("id")
    .single();

  if (ctErr || !contrato) {
    await sb.from("clientes").delete().eq("id", cliente.id);
    return { ok: false, error: ctErr?.message ?? "No pude crear el contrato." };
  }

  if ((veh as { estado: string }).estado !== "activo") {
    await sb.from("vehiculos").update({ estado: "activo" }).eq("id", vehiculoId);
  }

  // Si ya hay chat por WhatsApp, enlazarlo.
  const wa = str(formData.get("whatsapp"));
  if (wa) {
    const emp = (veh as { empresa?: { codigo?: string } | null }).empresa?.codigo ?? null;
    const etiqueta = etiquetaCarroUi(emp, (veh as { numero: string }).numero);
    await sb
      .from("conversaciones")
      .update({
        cliente_id: cliente.id,
        vehiculo_id: vehiculoId,
        contrato_id: contrato.id,
        etiqueta: etiqueta || `Carro ${(veh as { numero: string }).numero}`,
      })
      .eq("wa_numero", wa.replace(/\s+/g, ""));
  }

  revalidatePath("/cartera/clientes");
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/conversaciones");
  return { ok: true };
}

export type CarroLibre = {
  id: string;
  label: string;
};

/** Carros sin contrato activo (disponibles para alta). */
export async function listarCarrosLibres(): Promise<CarroLibre[]> {
  const sb = createServerSupabase();
  const { data: veh } = await sb
    .from("vehiculos")
    .select("id, numero, placa, estado, empresa:empresas(codigo)")
    .neq("estado", "entregado")
    .order("numero");
  const { data: activos } = await sb.from("contratos").select("vehiculo_id").eq("estado", "activo");
  const ocupados = new Set(
    ((activos ?? []) as { vehiculo_id: string }[]).map((c) => c.vehiculo_id),
  );
  return ((veh ?? []) as unknown as {
    id: string;
    numero: string;
    placa: string | null;
    estado: string;
    empresa: { codigo: string } | null;
  }[])
    .filter((v) => !ocupados.has(v.id))
    .map((v) => {
      const sigla = v.empresa?.codigo ? siglaEmpresa(v.empresa.codigo) : "";
      const base = sigla ? `${sigla} · ${v.numero}` : v.numero;
      const placa = v.placa ? ` · ${v.placa}` : "";
      return { id: v.id, label: `${base}${placa} (${v.estado})` };
    });
}
