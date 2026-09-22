// Compat: envíos/crons usan el alcance de DB (lib/cartera/alcance).
// CARTERA_EMPRESAS queda solo como fallback si la migración 0028 no está.

export {
  empresasAlcanceCodigos as empresasEnvioPermitidas,
  filtrarPorAlcance as filtrarEstadosPorEmpresaEnvio,
} from "./alcance";
