import Link from "next/link";

export const metadata = {
  title: "Condiciones del Servicio · Inversiones Auto Lujo Panamá",
  description: "Términos y condiciones del servicio de arrendamiento con opción de compra.",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg font-bold text-ink">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 sm:px-10">
      <div className="h-[3px] w-16 bg-gold" />
      <h1 className="mt-6 font-serif text-3xl font-bold text-ink">Condiciones del Servicio</h1>
      <p className="mt-2 text-sm text-muted">
        Inversiones Auto Lujo Panamá · Última actualización: 29 de agosto de 2026
      </p>

      <Seccion titulo="1. Aceptación de las condiciones">
        <p>
          Al contratar o utilizar los servicios de <strong>Inversiones Auto Lujo Panamá S.A.</strong>,{" "}
          <strong>Kowua S.A.</strong> o <strong>Reparaciones Automotrices Gold S.A.</strong> (en
          adelante, “Auto Lujo”), aceptas estas condiciones. El{" "}
          <strong>contrato de arrendamiento firmado</strong> entre las partes es el documento que rige
          la relación; estas condiciones son un resumen informativo y no lo sustituyen.
        </p>
      </Seccion>

      <Seccion titulo="2. El servicio">
        <p>
          Auto Lujo ofrece el <strong>arrendamiento diario de vehículos con opción de compra</strong>.
          El arrendatario paga una cuota diaria acordada y, al completar el número de cuotas pactado y
          encontrarse a paz y salvo, puede optar por el traspaso del vehículo a su nombre.
        </p>
      </Seccion>

      <Seccion titulo="3. Requisitos">
        <ul className="ml-5 list-disc space-y-1">
          <li>Ser mayor de edad y contar con licencia de conducir panameña vigente.</li>
          <li>Cédula o carnet de residencia vigente y referencias personales.</li>
          <li>Pagar el abono inicial, el cual <strong>no es reembolsable</strong>.</li>
          <li>Cumplir con el proceso de evaluación y entrevista de Auto Lujo.</li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Pagos">
        <p>
          La cuota es <strong>diaria, de lunes a sábado</strong> (los domingos son libres, salvo pacto
          en contrario). El horario de pago es hasta las 7:00 p.m.; el pago puntual puede otorgar un
          descuento y el pago tardío puede generar recargos. Los montos, recargos por mora, exceso de
          kilometraje y demás cargos se detallan en el contrato firmado.
        </p>
      </Seccion>

      <Seccion titulo="5. Uso del vehículo">
        <ul className="ml-5 list-disc space-y-1">
          <li>El vehículo es de uso personal del arrendatario; no puede subarrendarse ni cederse a terceros.</li>
          <li>Debe respetarse los límites geográficos y las normas de tránsito de la República de Panamá.</li>
          <li>Está prohibido manipular el GPS, el sistema de rastreo o modificar el vehículo sin autorización.</li>
          <li>Las infracciones de tránsito y el uso indebido del Panapass son responsabilidad del arrendatario.</li>
        </ul>
      </Seccion>

      <Seccion titulo="6. Mantenimiento, daños y seguros">
        <p>
          El mantenimiento, las reparaciones, llantas y daños del vehículo corren por cuenta del
          arrendatario según lo estipulado en el contrato. La póliza de seguro exigida por ley es
          asumida por Auto Lujo, que decide su uso ante siniestros. En caso de colisión, el
          arrendatario debe notificar de inmediato y seguir el procedimiento indicado.
        </p>
      </Seccion>

      <Seccion titulo="7. Terminación del contrato">
        <p>
          El contrato puede terminarse anticipadamente por incumplimiento del arrendatario —entre
          otras causas, el impago de tres (3) cuotas, el uso indebido del vehículo o la manipulación
          del sistema de rastreo—, conforme a las causales detalladas en el contrato firmado.
        </p>
      </Seccion>

      <Seccion titulo="8. Comunicaciones por WhatsApp">
        <p>
          Auto Lujo se comunica con sus arrendatarios a través de WhatsApp para recordatorios,
          estados de cuenta, recepción de comprobantes y atención. Al proporcionar tu número aceptas
          recibir estas comunicaciones relacionadas con tu contrato.
        </p>
      </Seccion>

      <Seccion titulo="9. Limitación de responsabilidad">
        <p>
          Auto Lujo no será responsable por daños derivados del uso indebido del vehículo por parte del
          arrendatario ni por hechos imputables a este frente a terceros o autoridades.
        </p>
      </Seccion>

      <Seccion titulo="10. Ley aplicable">
        <p>
          Estas condiciones se rigen por las leyes de la <strong>República de Panamá</strong>. Cualquier
          controversia se resolverá conforme a la legislación vigente y a lo pactado en el contrato.
        </p>
      </Seccion>

      <Seccion titulo="11. Contacto">
        <p>
          Para cualquier consulta, escríbenos por WhatsApp al número de atención de Auto Lujo o al
          correo{" "}
          <a href="mailto:inversionesautolujopanama@hotmail.com" className="text-ink underline">
            inversionesautolujopanama@hotmail.com
          </a>
          . Consulta también nuestra{" "}
          <Link href="/privacidad" className="text-ink underline">Política de Privacidad</Link>.
        </p>
      </Seccion>

      <footer className="mt-14 border-t border-line pt-6 text-xs text-muted">
        © 2026 Inversiones Auto Lujo Panamá. Todos los derechos reservados.
      </footer>
    </main>
  );
}
