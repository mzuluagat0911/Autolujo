import ExcelJS from "exceljs";
import type { CitaComercial } from "./citas";
import { sedePorId } from "./sedes";

function confirmacion(cita: CitaComercial): string {
  if (cita.estado === "cancelada") return "Cancelada";
  if (cita.confirmacion === "chat") return "Confirmó por chat";
  if (cita.confirmacion === "llamada") return "Confirmó por llamada";
  return "Sin confirmar";
}

function visita(cita: CitaComercial): string {
  if (cita.estado === "cancelada") return "Cancelada";
  if (cita.asistencia === "asistio") return "Asistió";
  if (cita.asistencia === "no_asistio") return "No asistió";
  return "Pendiente";
}

export async function libroCitas(citas: CitaComercial[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Citas");
  hoja.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Hora", key: "hora", width: 10 },
    { header: "Cliente", key: "nombre", width: 28 },
    { header: "Celular", key: "celular", width: 16 },
    { header: "Sede", key: "sede", width: 16 },
    { header: "Lugar", key: "lugar", width: 24 },
    { header: "Confirmación", key: "confirmacion", width: 22 },
    { header: "Visita", key: "visita", width: 14 },
    { header: "Campaña", key: "campana", width: 28 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const cita of citas) {
    hoja.addRow({
      fecha: cita.fecha,
      hora: cita.hora,
      nombre: cita.nombre,
      celular: cita.celular || cita.waNumero,
      sede: sedePorId(cita.sede)?.nombre ?? cita.sede,
      lugar: cita.lugar ?? "",
      confirmacion: confirmacion(cita),
      visita: visita(cita),
      campana: cita.anuncio || cita.campanaId || "",
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
