import { PageHeader, PageShell } from "@/components/kit";
import Link from "next/link";
import { ChapisteriaVista } from "./vista";

export const dynamic = "force-dynamic";

export default function ChapisteriaPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Operaciones"
        title="Chapistería"
        subtitle="Misma tabla que usa Cartera para cobrar. Tarifario Grand i10 / Soluto, cajas y talleres."
        action={
          <Link
            href="/cartera/cobros-taller"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Vista Cartera
          </Link>
        }
      />
      <ChapisteriaVista />
    </PageShell>
  );
}
