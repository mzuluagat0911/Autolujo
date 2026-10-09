import Link from "next/link";
import { PageHeader, PageShell } from "@/components/kit";
import { listarCitas } from "@/lib/comercial/citas";
import { ListaCitas } from "./lista";

export const dynamic = "force-dynamic";

export default async function CitasComercialPage() {
  const { citas, error } = await listarCitas();
  const porCampana = new Map<string, number>();
  for (const c of citas) {
    const clave = c.anuncio || c.campanaId || "Sin campaña";
    porCampana.set(clave, (porCampana.get(clave) ?? 0) + 1);
  }
  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Citas"
        subtitle="Las visitas que deja Lucía. Sin confirmar, el equipo llama. Confirmada por chat o por llamada queda marcada."
        action={
          <Link
            href="/comercial"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Chats
          </Link>
        }
      />
      {porCampana.size > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {[...porCampana.entries()].map(([nombre, n]) => (
            <li key={nombre} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink">
              {nombre} · {n}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <ListaCitas citas={citas} error={error} />
      </div>
    </PageShell>
  );
}
