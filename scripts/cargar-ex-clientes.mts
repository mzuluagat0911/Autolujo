// Carga el Excel de ex clientes a public.ex_clientes.
// Excel manda el saldo. Aaron y José Carlos duplicados quedan una sola fila.
//
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/cargar-ex-clientes.mts
//   ... --commit

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import {
  filaCarga,
  montoCelda,
  prepararCarga,
  resumenCarga,
  textoCelda,
  type FilaCargaEx,
  type FilaExcelEx,
} from "../lib/cartera/ex-clientes-carga.ts";

const COMMIT = process.argv.includes("--commit");
const EXCEL =
  process.argv.find((a) => a.endsWith(".xlsx")) ??
  `${process.env.HOME}/Downloads/Ex-clientes-autolujo (1).xlsx`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function tablaAusente(message: string): boolean {
  return /ex_clientes|schema cache|could not find the table/i.test(message);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(EXCEL);
const ws = wb.getWorksheet("EXCLIENTES") ?? wb.worksheets.find((s) => s.name !== "Cómo llenarlo");
if (!ws) {
  console.error("No encontré la hoja EXCLIENTES.");
  process.exit(1);
}

const crudas: FilaExcelEx[] = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const nombre = textoCelda(row.getCell(2).value);
  if (!nombre) return;
  crudas.push({
    carro: textoCelda(row.getCell(1).value),
    nombre,
    cedula: textoCelda(row.getCell(3).value),
    celular: textoCelda(row.getCell(4).value),
    deuda: montoCelda(row.getCell(6).value),
    motivo: textoCelda(row.getCell(7).value),
  });
});

const preparado = prepararCarga(crudas);
let listas: FilaCargaEx[] = preparado.listas;
let sinEmpresa = preparado.sinEmpresa;

if (sinEmpresa.length) {
  const numeros = [...new Set(sinEmpresa.map((f) => f.carro.trim()).filter(Boolean))];
  const { data: vehiculos } = await sb
    .from("vehiculos")
    .select("numero, empresa:empresas(codigo)")
    .in("numero", numeros);
  const porNumero = new Map<string, "AUTOLUJO" | "KOWUA" | "GOLD">();
  for (const v of (vehiculos ?? []) as {
    numero: string;
    empresa: { codigo: string } | { codigo: string }[] | null;
  }[]) {
    const emp = Array.isArray(v.empresa) ? v.empresa[0] : v.empresa;
    const codigo = emp?.codigo;
    if (codigo === "AUTOLUJO" || codigo === "KOWUA" || codigo === "GOLD") porNumero.set(v.numero, codigo);
  }
  const siguen: FilaExcelEx[] = [];
  for (const f of sinEmpresa) {
    const codigo = porNumero.get(f.carro.trim());
    if (!codigo) {
      siguen.push(f);
      continue;
    }
    listas.push(filaCarga(f, codigo));
  }
  sinEmpresa = siguen;
}

const resumen = resumenCarga(listas);
console.log(`Excel: ${crudas.length} filas → ${resumen.personas} personas · saldo $${resumen.saldo}`);
console.log("Por empresa:", resumen.porEmpresa);
console.log("Sin WhatsApp válido:", resumen.sinWhatsapp);
if (sinEmpresa.length) console.log("Sin empresa:", sinEmpresa.map((f) => `${f.carro} ${f.nombre}`));

if (!COMMIT) {
  console.log("Dry-run. Pasá --commit para escribir.");
  process.exit(0);
}

const { data: empresas, error: errEmp } = await sb.from("empresas").select("id, codigo");
if (errEmp || !empresas?.length) {
  console.error("No pude leer empresas:", errEmp?.message);
  process.exit(1);
}
const empId = new Map((empresas as { id: string; codigo: string }[]).map((e) => [e.codigo, e.id]));

const { error: probe } = await sb.from("ex_clientes").select("id").limit(1);
if (probe && tablaAusente(probe.message)) {
  console.error("Falta aplicar supabase/migrations/0048_ex_clientes.sql en el SQL Editor.");
  process.exit(2);
}

const { data: actuales, error: errAct } = await sb.from("ex_clientes").select("id, cedula, origen");
if (errAct) {
  console.error(errAct.message);
  process.exit(1);
}
const porCedula = new Map(
  ((actuales ?? []) as { id: string; cedula: string | null; origen: string }[])
    .filter((r) => r.cedula)
    .map((r) => [r.cedula!.replace(/\s+/g, ""), r]),
);

let insertados = 0;
let actualizados = 0;
let fallidos = 0;
for (const f of listas) {
  const empresaId = empId.get(f.empresaCodigo);
  if (!empresaId) {
    console.error("Sin empresa", f.empresaCodigo, f.carro);
    fallidos += 1;
    continue;
  }
  const body = {
    nombre: f.nombre,
    cedula: f.cedula || null,
    telefono: f.telefono,
    whatsapp: f.whatsapp,
    empresa_id: empresaId,
    carro: f.carro || null,
    saldo: f.deuda,
    motivo: f.motivo || null,
    origen: "excel",
    estado: f.deuda > 0.009 ? "cobro" : "cerrado",
    updated_at: new Date().toISOString(),
  };
  const ya = f.cedula ? porCedula.get(f.cedula.replace(/\s+/g, "")) : null;
  if (ya) {
    const { error } = await sb.from("ex_clientes").update(body).eq("id", ya.id);
    if (error) {
      console.error("PATCH", f.nombre, error.message);
      fallidos += 1;
    } else actualizados += 1;
  } else {
    const { error } = await sb.from("ex_clientes").insert(body);
    if (error) {
      console.error("POST", f.nombre, error.message);
      fallidos += 1;
    } else insertados += 1;
  }
}

const claves = new Set(
  listas.map((f) => (f.cedula ? `ced:${f.cedula.replace(/\s+/g, "")}` : `nom:${f.nombre}|${f.carro}`)),
);
const { data: excelActual, error: errExcel } = await sb
  .from("ex_clientes")
  .select("id, cedula, nombre, carro")
  .eq("origen", "excel");
if (errExcel) {
  console.error(errExcel.message);
  process.exit(1);
}
let cerrados = 0;
for (const row of (excelActual ?? []) as { id: string; cedula: string | null; nombre: string; carro: string | null }[]) {
  const clave = row.cedula?.trim()
    ? `ced:${row.cedula.replace(/\s+/g, "")}`
    : `nom:${row.nombre}|${row.carro ?? ""}`;
  if (claves.has(clave)) continue;
  const { error } = await sb.from("ex_clientes").update({
    estado: "cerrado",
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (error) {
    console.error("CERRAR", row.carro, error.message);
    fallidos += 1;
  } else cerrados += 1;
}

console.log(`Listo. insertados=${insertados} actualizados=${actualizados} fueraDeLista=${cerrados} fallidos=${fallidos}`);
console.log("Sin WhatsApp:", listas.filter((f) => !f.whatsapp).map((f) => f.carro).join(", ") || "ninguno");
if (fallidos) process.exit(1);
