import Link from "next/link";

export const metadata = {
  title: "Auto Lujo Panamá · Renta de autos con opción de compra",
  description:
    "Arrendamiento diario de autos con opción de compra en Panamá. Maneja hoy, hazlo tuyo mañana — sin banco.",
};

const WHATSAPP = "https://wa.me/50769964199"; // contacto comercial (editable)

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <span className="font-serif text-xl font-bold tracking-tight">
          Auto Lujo <span className="text-gold">Panamá</span>
        </span>
        <nav className="flex items-center gap-6 text-sm">
          <a href="#como" className="hidden text-muted transition hover:text-ink sm:inline">Cómo funciona</a>
          <a href="#contacto" className="hidden text-muted transition hover:text-ink sm:inline">Contacto</a>
          <Link
            href="/admin"
            className="rounded-lg bg-ink px-4 py-2 font-medium text-paper transition hover:bg-black"
          >
            Administrador
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute left-0 top-0 h-full w-[3px] bg-gold" />
        <div className="mx-auto max-w-6xl px-6 py-24 sm:px-10 sm:py-32">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-gold">Renta con opción de compra</p>
          <h1 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-tight sm:text-6xl">
            Maneja hoy. <span className="text-gold">Hazlo tuyo</span> mañana.
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

      {/* Value props */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { t: "Sin banco", d: "Nada de créditos ni papeleo interminable. El acuerdo es directo con nosotros." },
            { t: "Cuota diaria", d: "Pagas por día, de lunes a sábado. Domingos libres. Puntual, con descuento." },
            { t: "El carro será tuyo", d: "Al completar tu plan y estar al día, el vehículo se traspasa a tu nombre." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="h-[3px] w-10 bg-gold" />
              <h3 className="mt-4 font-serif text-xl font-bold">{v.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como" className="bg-surface">
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
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="mx-auto max-w-6xl px-6 py-20 text-center sm:px-10">
        <h2 className="font-serif text-3xl font-bold">¿Listo para tu carro?</h2>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Escríbenos por WhatsApp y un asesor te atiende con toda la información.
        </p>
        <a
          href={WHATSAPP}
          className="mt-7 inline-block rounded-xl bg-ink px-8 py-3 font-semibold text-paper transition hover:bg-black"
        >
          Contáctanos por WhatsApp
        </a>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <span className="font-serif text-lg font-bold text-white">
              Auto Lujo <span className="text-gold">Panamá</span>
            </span>
            <p className="mt-1 text-xs">© 2026 Inversiones Auto Lujo Panamá. Todos los derechos reservados.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/privacidad" className="transition hover:text-white">Política de Privacidad</Link>
            <Link href="/terminos" className="transition hover:text-white">Condiciones del Servicio</Link>
            <Link href="/admin" className="transition hover:text-white">Administrador</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
