export const metadata = {
  title: "Política de Privacidad · Inversiones Auto Lujo Panamá",
  description: "Cómo tratamos tus datos personales en Inversiones Auto Lujo Panamá.",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg font-bold text-ink">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 sm:px-10">
      <div className="h-[3px] w-16 bg-gold" />
      <h1 className="mt-6 font-serif text-3xl font-bold text-ink">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted">
        Inversiones Auto Lujo Panamá · Última actualización: 29 de agosto de 2026
      </p>

      <Seccion titulo="1. Quiénes somos">
        <p>
          Esta política aplica a <strong>Inversiones Auto Lujo Panamá S.A.</strong>,{" "}
          <strong>Kowua S.A.</strong> (RUC 155702301-2-2021) y{" "}
          <strong>Reparaciones Automotrices Gold S.A.</strong> (en adelante, “Auto Lujo”, “nosotros”),
          empresas dedicadas al arrendamiento de vehículos con opción de compra en la República de
          Panamá. Somos responsables del tratamiento de los datos personales descritos en este
          documento, conforme a la <strong>Ley 81 de 26 de marzo de 2019</strong> sobre Protección de
          Datos Personales.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos recolectamos">
        <p>Tratamos únicamente los datos necesarios para la relación de arrendamiento y cobranza:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Datos de identificación: nombre, cédula, teléfono, dirección y referencias personales.</li>
          <li>Datos del contrato y del vehículo arrendado.</li>
          <li>Comprobantes de pago (capturas de transferencias) que nos envías.</li>
          <li>Mensajes e imágenes que intercambias con nosotros por WhatsApp.</li>
        </ul>
      </Seccion>

      <Seccion titulo="3. Para qué usamos tus datos">
        <ul className="ml-5 list-disc space-y-1">
          <li>Gestionar tu contrato de arrendamiento y el registro de tus pagos diarios.</li>
          <li>Conciliar los comprobantes de pago que envías con tu cuenta.</li>
          <li>Atenderte y darte seguimiento por WhatsApp (dudas, recordatorios, estados de cuenta).</li>
          <li>Cumplir con obligaciones contractuales, contables y legales.</li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Atención por WhatsApp">
        <p>
          Nos comunicamos contigo a través de la plataforma <strong>WhatsApp Business</strong>, de Meta
          Platforms, Inc. Los mensajes que intercambias se procesan también bajo las políticas de
          privacidad de WhatsApp/Meta. Usamos estos canales para brindarte atención, enviarte
          notificaciones sobre tu cuenta y recibir tus comprobantes de pago.
        </p>
      </Seccion>

      <Seccion titulo="5. Con quién compartimos tus datos">
        <p>
          <strong>No vendemos ni alquilamos tus datos personales.</strong> Solo los compartimos con:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Proveedores tecnológicos que nos ayudan a operar (mensajería de WhatsApp/Meta y alojamiento seguro de la información), bajo obligaciones de confidencialidad.</li>
          <li>Autoridades competentes, cuando una ley o una orden judicial así lo exija.</li>
        </ul>
      </Seccion>

      <Seccion titulo="6. Conservación">
        <p>
          Conservamos tus datos mientras exista la relación contractual y durante el tiempo adicional
          que exijan las obligaciones legales, contables y fiscales aplicables. Luego se eliminan o
          anonimizan de forma segura.
        </p>
      </Seccion>

      <Seccion titulo="7. Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus datos contra accesos
          no autorizados, pérdida o alteración. El acceso está restringido al personal autorizado para
          la gestión de tu cuenta.
        </p>
      </Seccion>

      <Seccion titulo="8. Tus derechos">
        <p>
          Conforme a la Ley 81 de 2019, tienes derecho a <strong>acceder</strong>, <strong>rectificar</strong>,{" "}
          <strong>cancelar</strong> y <strong>oponerte</strong> al tratamiento de tus datos personales.
          Para ejercerlos, escríbenos por los canales de contacto indicados abajo.
        </p>
      </Seccion>

      <Seccion titulo="9. Menores de edad">
        <p>
          Nuestros servicios están dirigidos a personas mayores de edad. No recolectamos
          intencionalmente datos de menores de edad.
        </p>
      </Seccion>

      <Seccion titulo="10. Cambios a esta política">
        <p>
          Podemos actualizar esta política cuando sea necesario. La versión vigente será siempre la
          publicada en esta página, con su fecha de última actualización.
        </p>
      </Seccion>

      <Seccion titulo="11. Contacto">
        <p>
          Para consultas sobre esta política o sobre tus datos personales, contáctanos por WhatsApp al
          número de atención de Auto Lujo o al correo{" "}
          <a href="mailto:inversionesautolujopanama@hotmail.com" className="text-ink underline">
            inversionesautolujopanama@hotmail.com
          </a>
          .
        </p>
      </Seccion>

      <footer className="mt-14 border-t border-line pt-6 text-xs text-muted">
        © 2026 Inversiones Auto Lujo Panamá. Todos los derechos reservados.
      </footer>
    </main>
  );
}
