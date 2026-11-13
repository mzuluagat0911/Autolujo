"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { telefonosDeAlta } from "@/lib/cartera/enlazar-alta";

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

function aviso(msg: string): never {
  redirect(`/cartera/ex-clientes?aviso=${encodeURIComponent(msg)}`);
}

function tablaAusente(message: string): boolean {
  return /ex_clientes|schema cache|could not find the table/i.test(message);
}

export async function registrarExCliente(formData: FormData): Promise<void> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) aviso("El nombre es obligatorio.");

  const empresaId = str(formData.get("empresa_id"));
  if (!empresaId) aviso("Elegí la empresa (AL, KW o GD). Ahí va el pago.");

  const saldo = num(formData.get("saldo"));
  if (saldo == null || saldo < 0) aviso("El saldo no puede quedar vacío ni negativo.");

  const celularRaw = str(formData.get("celular"));
  const tels = telefonosDeAlta(celularRaw, celularRaw);
  if (celularRaw && !tels) aviso("Celular inválido. Usá 8 dígitos o +507.");

  const cedula = str(formData.get("cedula"));
  const sb = createServerSupabase();

  if (cedula) {
    const { data: yaCedula, error: errCed } = await sb
      .from("ex_clientes")
      .select("id, nombre")
      .eq("cedula", cedula)
      .maybeSingle();
    if (errCed && tablaAusente(errCed.message)) aviso("Falta aplicar la migración 0048 para registrar ex clientes.");
    if (yaCedula) aviso(`Esa cédula ya está en ${yaCedula.nombre}.`);
  }
  if (tels) {
    const { data: yaWa, error: errWa } = await sb
      .from("ex_clientes")
      .select("id, nombre")
      .eq("whatsapp", tels.whatsapp)
      .maybeSingle();
    if (errWa && tablaAusente(errWa.message)) aviso("Falta aplicar la migración 0048 para registrar ex clientes.");
    if (yaWa) aviso(`Ese celular ya está en ${yaWa.nombre}.`);
  }

  const { error } = await sb.from("ex_clientes").insert({
    nombre,
    cedula,
    telefono: tels?.telefono ?? celularRaw,
    whatsapp: tels?.whatsapp ?? null,
    empresa_id: empresaId,
    carro: str(formData.get("carro")),
    saldo,
    motivo: str(formData.get("motivo")),
    notas: str(formData.get("notas")),
    origen: "manual",
    estado: "cobro",
  });
  if (error) {
    if (tablaAusente(error.message)) aviso("Falta aplicar la migración 0048 para registrar ex clientes.");
    if (/idx_ex_clientes_cedula|ex_clientes_cedula/i.test(error.message)) {
      aviso("Esa cédula ya está registrada.");
    }
    if (/idx_ex_clientes_whatsapp|ex_clientes_whatsapp/i.test(error.message)) {
      aviso("Ese celular ya está registrado.");
    }
    aviso(error.message);
  }

  revalidatePath("/cartera/ex-clientes");
  aviso(`Quedó ${nombre} con $${Math.round(saldo)} de deuda.`);
}
