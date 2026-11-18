// Qué tablas puede leer el asistente. Lee todos los módulos del equipo.
// No escribe. Las cuentas bancarias, los teléfonos de WhatsApp y las
// posiciones crudas del GPS no entran.

import type { ModuloId } from "@/lib/equipo/modulos";

export type TablaAsistente = {
  nombre: string;
  modulos: readonly ModuloId[];
  uso: string;
};

const TABLAS: readonly TablaAsistente[] = [
  { nombre: "empresas", modulos: ["resumen", "cartera", "operaciones", "comercial", "seguros", "configuracion"], uso: "Autolujo, Kowua y Gold. codigo, nombre." },
  { nombre: "vehiculos", modulos: ["resumen", "cartera", "operaciones", "comercial", "seguros"], uso: "Carro: numero, placa, panapass (el número del tag: sí se dice), marca, modelo, anio, km_actual, estado, empresa_id." },
  { nombre: "contratos", modulos: ["resumen", "cartera", "operaciones", "comercial", "seguros"], uso: "Contrato activo o no: letra_diaria, fecha_inicio, estado, saldo_inicial, vehiculo_id, cliente_id." },
  { nombre: "vw_saldo_contrato", modulos: ["resumen", "cartera"], uso: "Saldo del libro por contrato (contrato_id, saldo_actual). No es el 'a pagar hoy'." },
  { nombre: "metas_cobranza", modulos: ["resumen", "configuracion"], uso: "Meta de cobranza." },
  { nombre: "clientes", modulos: ["cartera", "comercial"], uso: "Nombre, notas y fecha_nacimiento (cumpleaños). Cédula, teléfono y dirección no se devuelven." },
  { nombre: "acuerdos", modulos: ["cartera"], uso: "Planes: abono inicial o acuerdo de pago. descripcion, saldo, cuota_diaria, cuota_domingo, activo." },
  { nombre: "cargos", modulos: ["cartera"], uso: "Lo que se cargó: fecha, tipo, concepto, monto, contrato_id." },
  { nombre: "pagos", modulos: ["cartera"], uso: "Lo que pagó: fecha, monto, estado_conciliacion, asignaciones, numero_carro." },
  { nombre: "tarifas", modulos: ["cartera", "comercial"], uso: "Letra diaria según modelo, año y km." },
  { nombre: "conversaciones", modulos: ["cartera"], uso: "Chats de cobro: etiqueta, modo, estado." },
  { nombre: "mensajes", modulos: ["cartera"], uso: "Mensajes del chat de cobro. Pide pocos y recientes." },
  { nombre: "ex_clientes", modulos: ["cartera"], uso: "Ex clientes: carro, saldo, motivo, estado." },
  { nombre: "recordatorios", modulos: ["cartera"], uso: "Recordatorios de cartera." },
  { nombre: "salidas_autorizadas", modulos: ["cartera", "operaciones"], uso: "Salidas al interior autorizadas." },
  { nombre: "salidas_alertas", modulos: ["cartera", "operaciones"], uso: "Alertas de salida." },
  { nombre: "conceptos_cargo", modulos: ["cartera"], uso: "Catálogo de conceptos de cargo." },
  { nombre: "estados_cuenta", modulos: ["cartera"], uso: "Estados de cuenta guardados." },
  { nombre: "vehiculo_eventos", modulos: ["operaciones", "seguros"], uso: "Hoja de vida, mantenimiento, chapistería y choques." },
  { nombre: "gps_dias", modulos: ["operaciones"], uso: "Kilometraje por día. No hay posiciones punto a punto." },
  { nombre: "conversaciones_comercial", modulos: ["comercial"], uso: "Chats de venta." },
  { nombre: "mensajes_comercial", modulos: ["comercial"], uso: "Mensajes de venta. Pide pocos y recientes." },
  { nombre: "citas_comercial", modulos: ["comercial"], uso: "Citas de comercial." },
  { nombre: "eventos_comercial", modulos: ["comercial"], uso: "Actividad comercial." },
  { nombre: "seguimientos_comercial", modulos: ["comercial"], uso: "Seguimientos de un lead." },
  { nombre: "cartera_alcance", modulos: ["configuracion"], uso: "Qué empresas ve cartera." },
  { nombre: "config_reglas", modulos: ["configuracion"], uso: "Reglas globales por empresa." },
  { nombre: "equipo", modulos: ["equipo"], uso: "Usuarios del equipo: nombre, correo, rol, activo. Sin claves." },
];

/** Tablas que el asistente no abre aunque pidan el nombre. */
export const TABLAS_CERRADAS = [
  "cuentas_bancarias",
  "wa_vinculos",
  "gps_posiciones",
  "movimientos_extracto",
  "conciliacion_huellas",
  "conciliacion_pesos",
] as const;

export function tablasDe(_modulos: readonly ModuloId[]): TablaAsistente[] {
  return [...TABLAS];
}

export function puedeTabla(_modulos: readonly ModuloId[], nombre: string): boolean {
  const n = nombre.trim().toLowerCase();
  if ((TABLAS_CERRADAS as readonly string[]).includes(n)) return false;
  return TABLAS.some((t) => t.nombre === n);
}

export function textoCatalogo(modulos: readonly ModuloId[]): string {
  return tablasDe(modulos)
    .map((t) => `- ${t.nombre}: ${t.uso}`)
    .join("\n");
}
