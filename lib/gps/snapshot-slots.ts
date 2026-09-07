// Cuántas veces al día se dispara el snapshot GPS.
// Hobby: solo la tarde llama a Diacor. Pro: GPS_SNAPSHOT_PRO=on habilita mañana y noche.
// Los 3 crons están en vercel.json; mañana/noche salen al toque si no es Pro.

import { horaPanama } from "@/lib/cartera/fecha";

export type SlotSnapshot = "manana" | "tarde" | "noche";

export function slotDesdeHoraPanama(hora: number): SlotSnapshot {
  if (hora >= 5 && hora < 12) return "manana";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noche";
}

export function slotSnapshotActual(reqUrl?: string | null): {
  ok: boolean;
  slot: SlotSnapshot;
  motivo?: string;
} {
  let slot: SlotSnapshot | null = null;
  if (reqUrl) {
    try {
      const q = new URL(reqUrl).searchParams.get("slot");
      if (q === "manana" || q === "mañana") slot = "manana";
      else if (q === "noche") slot = "noche";
      else if (q === "tarde") slot = "tarde";
    } catch {
      /* ignore */
    }
  }
  if (!slot) {
    const h = Number(horaPanama().slice(0, 2));
    slot = slotDesdeHoraPanama(Number.isFinite(h) ? h : 15);
  }

  const pro =
    process.env.GPS_SNAPSHOT_PRO === "1" ||
    process.env.GPS_SNAPSHOT_PRO === "on" ||
    process.env.GPS_SNAPSHOT_PRO === "true";

  if (slot === "tarde") return { ok: true, slot };
  if (!pro) {
    return {
      ok: false,
      slot,
      motivo: "Hobby: solo corre el snapshot de la tarde. Ponga GPS_SNAPSHOT_PRO=on para mañana y noche.",
    };
  }
  return { ok: true, slot };
}
