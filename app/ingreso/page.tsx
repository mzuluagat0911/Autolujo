import { redirect } from "next/navigation";
import { createAuthSupabase } from "@/lib/supabase/auth";
import { hayEquipo, sesionEquipo } from "@/lib/equipo/sesion";
import { FormularioIngreso } from "./formulario";

export const dynamic = "force-dynamic";

export default async function IngresoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ya = await sesionEquipo();
  if (ya) redirect("/cartera");
  const auth = await createAuthSupabase();
  const { data } = await auth.auth.getUser();
  if (data.user) await auth.auth.signOut();
  const q = await searchParams;
  const next = q.next?.startsWith("/") ? q.next : "/cartera";
  const primer = !(await hayEquipo());

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 ring-1 ring-line">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">AutoLujo</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {primer ? "Primer acceso del equipo" : "Ingreso"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {primer
            ? "Cree la cuenta del administrador. Después invita al resto desde Usuarios y roles."
            : "Solo el equipo. Los arrendatarios siguen por WhatsApp."}
        </p>
        <FormularioIngreso primer={primer} next={next} />
      </div>
    </div>
  );
}
