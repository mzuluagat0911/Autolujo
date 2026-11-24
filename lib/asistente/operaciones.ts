// Lo mismo que muestra Operaciones: mantenimiento por km, kit, licencias y revisado.
// Sin el contacto del cliente.

import {
  evaluarKitTiempo,
  kitTiempoKm,
  licenciasSemaforo,
  mantenimientoKm,
  revisadoSemaforo,
} from "@/lib/operaciones/alertas";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { createServerSupabase } from "@/lib/supabase/server";
import { pistaDeCarro } from "./cobro";

export type TipoAlerta = "mantenimiento" | "kit" | "licencias" | "revisado";

const TOPE = 40;

async function kitDeCarro(carro: string) {
  const pista = pistaDeCarro(carro);
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("numero, km_actual, empresa:empresas(codigo)")
    .in("numero", pista.numeros);
  if (error) return { error: "No pude buscar el carro." };
  const vehs = ((data ?? []) as unknown as { numero: string; km_actual: number | null; empresa: { codigo: string } | null }[])
    .filter((v) => !pista.empresa || v.empresa?.codigo?.toUpperCase() === pista.empresa);
  if (vehs.length === 0) return { error: `No encontré el carro ${carro}.` };
  return {
    tipo: "kit",
    regla:
      "Primer kit a los 100.000 km y después cada 60.000. Se cita 5.000 km antes y hasta 5.000 km después. No hay registro de si el kit ya se hizo.",
    carros: vehs.map((v) => {
      const etiqueta = `${siglaEmpresa(v.empresa?.codigo ?? null)} ${v.numero}`.trim();
      if (v.km_actual == null) return { carro: etiqueta, error: "Sin km del odómetro." };
      const km = Math.round(Number(v.km_actual));
      return { carro: etiqueta, kmActual: km, kit: evaluarKitTiempo(km) };
    }),
  };
}

export async function alertasOperaciones(tipo: TipoAlerta, soloPendientes = true, carro?: string) {
  if (tipo === "kit" && carro) return kitDeCarro(carro);
  if (tipo === "mantenimiento") {
    const r = await mantenimientoKm();
    if (!r.disponible) return { error: "El mantenimiento por km no está disponible." };
    if (carro) {
      const pista = pistaDeCarro(carro);
      const hits = r.items.filter(
        (i) => pista.numeros.includes(i.vehiculoNumero) && (!pista.empresa || i.empresa?.toUpperCase() === pista.empresa),
      );
      if (hits.length === 0) return { error: `El carro ${carro} no tiene fecha de último mantenimiento cargada.` };
      return {
        tipo,
        regla: "Básico cada 6.000 km del GPS desde la fecha del último mantenimiento. Pronto desde 5.000. kmDesdeUltimo = km recorridos desde el último mantenimiento, no es atraso. atrasoKm = km que ya pasó de los 6.000.",
        carros: hits.map((i) => ({
          carro: `${siglaEmpresa(i.empresa)} ${i.vehiculoNumero}`.trim(),
          estado: i.estado,
          kmDesdeUltimo: i.kmDesde,
          ...(i.faltan >= 0 ? { faltanPara6000: i.faltan } : { atrasoKm: -i.faltan }),
          desde: i.desde,
        })),
      };
    }
    const todos = r.items.filter((i) => !soloPendientes || i.estado !== "ok");
    return {
      tipo,
      regla: "Pantalla de hoy: básico cada 6.000 km del GPS desde la fecha del último mantenimiento. Pronto desde 5.000. kmDesdeUltimo = km recorridos desde el último mantenimiento, no es atraso. atrasoKm = km que ya pasó de los 6.000.",
      total: todos.length,
      vencidos: todos.filter((i) => i.estado === "vencido").length,
      pronto: todos.filter((i) => i.estado === "pronto").length,
      recortado: todos.length > TOPE,
      carros: todos.slice(0, TOPE).map((i) => ({
        carro: `${siglaEmpresa(i.empresa)} ${i.vehiculoNumero}`.trim(),
        estado: i.estado,
        kmDesdeUltimo: i.kmDesde,
        ...(i.faltan >= 0 ? { faltanPara6000: i.faltan } : { atrasoKm: -i.faltan }),
        desde: i.desde,
      })),
    };
  }
  if (tipo === "kit") {
    const r = await kitTiempoKm();
    if (!r.disponible) return { error: "El kit de tiempos no está disponible." };
    return {
      tipo,
      regla:
        "Primer kit a los 100.000 km y después cada 60.000. Se cita 5.000 km antes y hasta 5.000 km después. No hay registro de si el kit ya se hizo.",
      total: r.items.length,
      recortado: r.items.length > TOPE,
      carros: r.items.slice(0, TOPE).map((i) => ({
        carro: `${siglaEmpresa(i.empresa)} ${i.vehiculoNumero}`.trim(),
        estado: i.estado,
        kmActual: i.kmActual,
        marcaKm: i.marcaKm,
        faltan: i.faltan,
      })),
    };
  }
  if (tipo === "licencias") {
    const r = await licenciasSemaforo();
    if (!r.disponible) return { error: "Las licencias no están disponibles." };
    const todos = r.items.filter((i) => !soloPendientes || i.nivel !== "verde");
    return {
      tipo,
      regla: "Vencido = ya pasó. Rojo = 30 días o menos. Amarillo = 90 días o menos.",
      total: todos.length,
      vencidas: todos.filter((i) => i.nivel === "vencido").length,
      recortado: todos.length > TOPE,
      licencias: todos.slice(0, TOPE).map((i) => ({
        carro: i.carro,
        nivel: i.nivel,
        vence: i.fecha,
        dias: i.dias,
      })),
    };
  }
  const r = await revisadoSemaforo();
  if (!r.disponible) return { error: "El revisado no está disponible." };
  const todos = r.items.filter((i) => !soloPendientes || i.nivel !== "verde");
  return {
    tipo,
    regla: "Vencido = ya pasó. Rojo = 30 días o menos. Amarillo = 90 días o menos.",
    total: todos.length,
    recortado: todos.length > TOPE,
    carros: todos.slice(0, TOPE).map((i) => ({
      carro: `${siglaEmpresa(i.empresa)} ${i.vehiculoNumero}`.trim(),
      nivel: i.nivel,
      vence: i.fecha,
      dias: i.dias,
    })),
  };
}
