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
  const next = q.next?.startsWith("/") && !q.next.startsWith("//") ? q.next : "/cartera";
  const primer = !(await hayEquipo());

  return (
    <div className="relative flex min-h-screen flex-col bg-black font-brand-ui text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,164,74,0.22), transparent 55%)",
        }}
      />
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 text-center">
            <p className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              AutoLujo <span className="text-gold">S.A</span>
            </p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/45">
              Siempre seguro
            </p>
          </div>

          <div className="rounded-xl bg-white p-7 text-ink ring-1 ring-white/10 sm:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Equipo
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {primer ? "Primer acceso" : "Iniciar sesión"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {primer
                ? "Cree la cuenta del administrador. Después da de alta al resto en Usuarios y roles."
                : "Solo personal interno. Los arrendatarios siguen por WhatsApp."}
            </p>
            <FormularioIngreso primer={primer} next={next} />
          </div>

          <p className="mt-8 text-center text-xs text-white/35">
            Inversiones Auto Lujo Panamá
          </p>
        </div>
      </div>
    </div>
  );
}
