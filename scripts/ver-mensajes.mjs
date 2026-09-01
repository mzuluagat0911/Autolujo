import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Cargar .env.local a mano (sin dependencias).
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: convs } = await sb
  .from("conversaciones")
  .select("id, wa_numero, etiqueta, modo, necesita_humano, motivo_escalada, contrato_id, ultimo_texto, ultimo_mensaje_at")
  .order("ultimo_mensaje_at", { ascending: false })
  .limit(5);

for (const c of convs ?? []) {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`CONV ${c.wa_numero}  ·  ${c.etiqueta ?? "sin etiqueta"}  ·  modo=${c.modo}${c.necesita_humano ? "  ⚠️ necesita_humano" : ""}`);
  console.log(`contrato_id=${c.contrato_id ?? "—"}  ${c.motivo_escalada ? "· escalada: " + c.motivo_escalada : ""}`);
  const { data: msgs } = await sb
    .from("mensajes")
    .select("direccion, tipo, texto, pago_id, created_at")
    .eq("conversacion_id", c.id)
    .order("created_at", { ascending: true })
    .limit(40);
  for (const m of msgs ?? []) {
    const who = m.direccion === "in" ? "👤 CLIENTE" : "🤝 AGENTE ";
    const t = new Date(m.created_at).toLocaleString("es-PA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    const tag = m.tipo !== "text" ? `[${m.tipo}]` : "";
    console.log(`  ${who} ${t} ${tag} ${m.texto ?? ""}${m.pago_id ? " (pago:" + m.pago_id.slice(0, 8) + ")" : ""}`);
  }
}
process.exit(0);
