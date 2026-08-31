import Link from "next/link";

export const metadata = {
  title: "Auto Lujo Panamá · Renta de autos con opción de compra",
  description:
    "Arrendamiento diario de autos con opción de compra en Panamá. Maneja hoy, hazlo tuyo mañana — sin banco.",
};

const WHATSAPP = "https://wa.me/50769964199"; // contacto comercial (editable)

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header */}
      <header className="bg-black">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Auto Lujo Panamá" className="h-12 w-auto" />
          <nav className="flex items-center gap-6 text-sm">
            <a href="#como" className="text-white/70 transition hover:text-white">Cómo funciona</a>
            <a href="#contacto" className="text-white/70 transition hover:text-white">Contacto</a>
          </nav>
        </div>
      </header>

      {/* Hero con video de fondo */}
      <section className="relative overflow-hidden bg-black text-white">
        {/* Video banner principal */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        >
          <source src="/6331328-uhd_4096_2160_24fps.mp4" type="video/mp4" />
        </video>
        {/* Degradado para legibilidad del texto (filtro más suave) */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
        <div className="absolute left-0 top-0 z-10 h-full w-[3px] bg-gold" />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-28 sm:px-10 sm:py-40">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-gold">Renta con opción de compra</p>
          <h1 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-tight sm:text-6xl">
            Lleva <span className="text-gold">TU CARRO</span> sin APC.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Arrendamiento diario de autos con opción de compra en Panamá. Sin banco, sin trámites
            eternos. Pagas tu cuota diaria y avanzas hacia tu propio carro.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              className="rounded-xl bg-gold px-6 py-3 font-semibold text-black transition hover:opacity-90"
            >
              Quiero un carro
            </a>
            <a
              href="#como"
              className="rounded-xl px-6 py-3 font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/5"
            >
              Cómo funciona
            </a>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
          <p className="text-center font-mono text-xs uppercase tracking-[0.28em] text-gold">
            Modelos 2022 – 2026
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center font-serif text-3xl font-bold sm:text-4xl">
            Beneficios que te llevan <span className="text-gold">más lejos</span>
          </h2>

          <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: "🛡️", label: "Respaldo y garantía" },
              { icon: "🔧", label: "Hasta 18 meses de mantenimiento gratis" },
              { icon: "🎂", label: "Cumpleaños libres" },
              { icon: "📋", label: "Planes flexibles con letras diarias" },
              { icon: "💲", label: "Abonos iniciales económicos" },
              { icon: "👥", label: "Plan referido" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl ring-2 ring-gold/50 shadow-[0_0_24px_rgba(212,175,55,0.15)]">
                  {b.icon}
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase leading-tight tracking-wide text-white/85">
                  {b.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* No miramos APC */}
        <div className="border-y border-gold/30 bg-gold/[0.06] py-7 text-center">
          <p className="font-serif text-3xl font-bold sm:text-4xl">
            ¡NO MIRAMOS <span className="text-gold">APC</span>!
          </p>
          <p className="mt-2 text-sm text-white/60">
            Te aprobamos sin revisar tu historial de crédito.
          </p>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como" className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-gold">Cómo funciona</p>
          <h2 className="mt-4 font-serif text-3xl font-bold">Tres pasos y estás manejando</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: "01", t: "Escríbenos", d: "Nos contactas por WhatsApp y te contamos las condiciones y la flota disponible." },
              { n: "02", t: "Firmas y recibes", d: "Con tu abono inicial firmas el contrato y te entregamos el carro listo para trabajar." },
              { n: "03", t: "Pagas y avanzas", d: "Envías tu comprobante diario por WhatsApp. Nosotros lo registramos al instante." },
            ].map((s) => (
              <div key={s.n}>
                <span className="font-serif text-3xl font-bold text-gold">{s.n}</span>
                <h3 className="mt-2 font-serif text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="mx-auto max-w-6xl px-6 py-20 text-center sm:px-10">
        <h2 className="font-serif text-3xl font-bold">¿Listo para tu carro?</h2>
        <p className="mx-auto mt-3 max-w-md text-black/60">
          Escríbenos por WhatsApp y un asesor te atiende con toda la información.
        </p>
        <a
          href={WHATSAPP}
          className="mt-7 inline-block rounded-xl bg-black px-8 py-3 font-semibold text-white transition hover:opacity-90"
        >
          Contáctanos por WhatsApp
        </a>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Auto Lujo Panamá" className="h-16 w-auto" />
            <p className="mt-3 text-xs">© 2026 Inversiones Auto Lujo Panamá. Todos los derechos reservados.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/privacidad" className="transition hover:text-white">Política de Privacidad</Link>
            <Link href="/terminos" className="transition hover:text-white">Condiciones del Servicio</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
