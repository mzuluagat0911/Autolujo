#!/usr/bin/env python3
"""Arma el Excel de carga de una empresa nueva. No escribe en la base."""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "plantilla-carga-empresa.xlsx"

INK = "0A0A0A"
PAPER = "FFFFFF"
MUTED_BG = "F3F4F6"
LINE = "E5E7EB"
ROJO = "FEF2F2"
AMBAR = "FFFBEB"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
fill_h = PatternFill("solid", fgColor=INK)
fill_hint = PatternFill("solid", fgColor=MUTED_BG)
fill_req = PatternFill("solid", fgColor="111111")
font_h = Font(name="Calibri", bold=True, color=PAPER, size=11)
font_b = Font(name="Calibri", size=11, color=INK)
font_title = Font(name="Calibri", bold=True, size=18, color=INK)
font_h2 = Font(name="Calibri", bold=True, size=13, color=INK)
font_small = Font(name="Calibri", size=11, color="374151")
wrap = Alignment(wrap_text=True, vertical="top")
center = Alignment(wrap_text=True, vertical="center", horizontal="center")


def comment(text: str) -> Comment:
    c = Comment(text, "AutoLujo")
    c.width = 280
    c.height = 80
    return c


def header(ws, cols: list[tuple[str, str, int, bool]]):
    """cols: (nombre, ayuda, ancho, obligatorio)."""
    ws.row_dimensions[1].height = 32
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}1"
    ws.freeze_panes = "A2"
    ws.sheet_view.showGridLines = False
    for i, (name, help_, width, req) in enumerate(cols, 1):
        cell = ws.cell(1, i, name + (" *" if req else ""))
        cell.font = font_h
        cell.fill = fill_h
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.comment = comment(("Obligatorio. " if req else "") + help_)
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}200"
    ws.sheet_properties.tabColor = INK


def paint_rows(ws, n_cols: int, start: int, end: int):
    for r in range(start, end + 1):
        ws.row_dimensions[r].height = 20
        for c in range(1, n_cols + 1):
            cell = ws.cell(r, c, None)
            cell.font = font_b
            cell.border = thin
            cell.alignment = Alignment(vertical="center")


def dv_list(ws, formula: str, cells: str):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    dv.error = "Usa uno de los valores de la lista."
    dv.errorTitle = "Valor"
    dv.add(cells)
    ws.add_data_validation(dv)


def main():
    wb = Workbook()

    leeme = wb.active
    leeme.title = "Cómo llenar"
    leeme.sheet_properties.tabColor = "C9A44A"
    leeme.sheet_view.showGridLines = False
    leeme.column_dimensions["A"].width = 28
    leeme.column_dimensions["B"].width = 108
    leeme.row_dimensions[1].height = 28
    leeme["A1"] = "Carga de una empresa nueva"
    leeme["A1"].font = font_title
    leeme.merge_cells("A1:B1")

    bloques = [
        ("Para qué es", "Una fila de Carros es un carro, con su cliente y su contrato. Los acuerdos van en otra hoja, uno por fila. Lo que no es letra (domingo pendiente, mantenimiento, panapass) va en Pendientes. Con eso el sistema cobra solo, sin mezclar conceptos."),
        ("Fecha de corte", "El saldo que escriben es el que queda cerrado ESE día, antes de que el sistema empiece. La letra del día siguiente la genera el sistema. No la sumen al saldo. Si el corte es el 30 de septiembre, el saldo es lo debido al cerrar el 30; el 1 de octubre la letra sale sola."),
        ("Saldo de letra", "Solo letras atrasadas, o crédito si el cliente pagó de más (número negativo). No metan aquí el acuerdo, ni el domingo, ni un recargo."),
        ("Domingo", "En el carro: cobra domingo SI o NO, y la cuota de UNA tajada (por ejemplo 30). El sistema cobra una tajada, no el balde entero. Si ya deben domingos, el balde va en Pendientes, concepto domingo, saldo = tajada × domingos que deben. Ejemplo: tajada 30 y deben 2 domingos → saldo 60."),
        ("Acuerdos", "Orden 1 es el único que se cobra. El 2, el 3 y la recogida esperan hasta que el de adelante quede en cero. No los junten en un solo saldo. dia = cuota cada día; si ponen fecha, ese es el primer día, y si la dejan vacía arranca con el sistema. domingo = solo domingos. semana, quincena o mes = la fecha ancla el día. fecha = se cobra una sola vez ese día (por ejemplo $200 el 1 de octubre), no es cuota diaria. cuota domingo del acuerdo es otra cifra, solo si el domingo de ESE plan cobra distinto (por ejemplo $5 de lunes a sábado y $30 el domingo)."),
        ("Recogida", "Si es un plan con saldo, va en Acuerdos con el orden de atrás. No entra al cobro mientras el plan de adelante tenga saldo."),
        ("Taller", "activo se cobra normal. mantenimiento, chapisteria o colision: desde la fecha de ingreso (puede ser futura) hasta el día antes de la fecha de activación no hay letra diaria ni acuerdo diario. Sí se cobra lo que ya debía. Si la activación está vacía, sigue pausado hasta que la pongan. Antes de la fecha de ingreso se cobra normal."),
        ("Teléfono", "El WhatsApp del cliente, 8 dígitos de Panamá, sin espacios ni guiones. También vale si trae 507 adelante."),
        ("Número de carro", "Único dentro de la empresa. Escríbanlo igual que el prefijo de la hoja Empresa: G01 si el prefijo es G, o 201 si el número va solo."),
        ("Empresas que ya están", "No usen los códigos AUTOLUJO ni GOLD. Esos carros ya viven en el sistema."),
        ("Qué no inventar", "No pongan recargo de $5 por no pagar: el sistema no lo suma solo y el equipo lo carga si aplica. El cierre de semana de $10 solo si ya está cargado y sigue debiendo; si no, déjenlo vacío. El descuento puntual déjenlo en 0."),
        ("Hojas", "Empresa: una fila por empresa. Carros: una fila por carro. Acuerdos: una fila por plan (un carro puede tener varios). Pendientes: una fila por saldo que no es letra ni acuerdo. La hoja Ejemplo muestra el formato; no la carguen."),
    ]
    r = 3
    for titulo, texto in bloques:
        leeme.cell(r, 1, titulo).font = font_h2
        leeme.cell(r, 1).alignment = Alignment(vertical="top")
        leeme.cell(r, 2, texto).font = font_small
        leeme.cell(r, 2).alignment = wrap
        leeme.row_dimensions[r].height = 48 if len(texto) < 220 else 72
        r += 1

    # Empresa
    emp_cols = [
        ("empresa", "Código corto, sin espacios. Único. Ejemplo: NORTE. No uses AUTOLUJO ni GOLD.", 16, True),
        ("nombre", "Nombre con el que la ven en el panel.", 28, True),
        ("prefijo_carro", "Lo que va pegado al número. G si los carros son G01. Vacío si el número va solo (201).", 16, False),
        ("numero_desde", "Primer número de la flota, solo el entero. 1 si son G01…G40.", 16, False),
        ("numero_hasta", "Último número de la flota.", 16, False),
        ("fecha_corte", "Día en que el saldo de los carros queda cerrado. Formato fecha.", 16, True),
        ("ruc", "Opcional.", 18, False),
        ("banco", "Opcional. Para el extracto.", 22, False),
        ("cuenta", "Número de cuenta. Opcional.", 22, False),
        ("titular", "Titular de la cuenta. Opcional.", 28, False),
    ]
    ws_e = wb.create_sheet("Empresa")
    header(ws_e, emp_cols)
    paint_rows(ws_e, len(emp_cols), 2, 8)
    ws_e.cell(2, 6).number_format = "YYYY-MM-DD"

    # Carros
    car_cols = [
        ("empresa", "El mismo código de la hoja Empresa.", 14, True),
        ("numero_carro", "Único en la empresa. G01 o 201, igual que el prefijo.", 16, True),
        ("placa", "Placa. Opcional si todavía no la tienen.", 14, False),
        ("marca", "Marca del carro.", 16, False),
        ("modelo", "Modelo.", 18, False),
        ("anio", "Año, cuatro dígitos.", 10, False),
        ("km_actual", "Kilometraje de hoy. Entero.", 12, False),
        ("estado", "activo, mantenimiento, chapisteria, colision, por_entregar, improductivo o entregado.", 16, True),
        ("fecha_ingreso_taller", "Solo si está en taller. Puede ser futura. Antes de ese día se cobra normal.", 22, False),
        ("fecha_activacion", "Día en que vuelve a productivo. Vacío si no se sabe. No puede ser antes del ingreso.", 18, False),
        ("nombre_cliente", "Nombre completo, como debe salir en el mensaje.", 32, True),
        ("cedula", "Cédula. Opcional.", 16, False),
        ("telefono", "WhatsApp, 8 dígitos.", 14, True),
        ("genero", "M o F. Sirve para el trato del mensaje.", 10, False),
        ("fecha_nacimiento", "Opcional. Para el saludo de cumpleaños.", 18, False),
        ("fecha_inicio", "Día en que empezó el contrato.", 14, True),
        ("letra_diaria", "Lo que se cobra de letra cada día hábil. Número, sin signo de dólar.", 14, True),
        ("cobra_domingo", "SI o NO.", 16, True),
        ("cuota_domingo", "Una tajada, no el balde. 0 si no cobra domingo.", 16, True),
        ("cuotas_del_deal", "Total de cuotas del plan (por ejemplo 1275). Vacío si no lo tienen.", 16, False),
        ("cuotas_pagadas", "Cuántas llevan pagadas. Vacío si no lo tienen. No lo calculen a ojo.", 16, False),
        ("abono_inicial", "Lo que ya pagó de entrada. No se vuelve a cobrar.", 14, False),
        ("saldo_letra_al_corte", "Solo letra, al cierre de la fecha de corte. Negativo si pagó de más. 0 si está al día.", 22, True),
        ("notas", "Algo que el equipo tenga que saber. No cambia el cobro.", 36, False),
    ]
    ws_c = wb.create_sheet("Carros")
    header(ws_c, car_cols)
    paint_rows(ws_c, len(car_cols), 2, 80)
    dv_list(ws_c, '"activo,mantenimiento,chapisteria,colision,por_entregar,improductivo,entregado"', "H2:H80")
    dv_list(ws_c, '"M,F"', "N2:N80")
    dv_list(ws_c, '"SI,NO"', "R2:R80")
    for col in (9, 10, 15, 16):
        for r in range(2, 81):
            ws_c.cell(r, col).number_format = "YYYY-MM-DD"

    # Acuerdos
    acu_cols = [
        ("empresa", "El mismo código de la hoja Empresa.", 14, True),
        ("numero_carro", "El mismo número de la hoja Carros.", 16, True),
        ("orden", "1 se cobra ahora. 2 y los que siguen esperan. La recogida va al final.", 12, True),
        ("descripcion", "Nombre del plan. Si hay dos iguales, la fecha los distingue.", 32, True),
        ("saldo", "Lo que falta de ese plan. No lo sumen al saldo de letra.", 14, True),
        ("frecuencia", "dia, domingo, semana, quincena, mes o fecha.", 14, True),
        ("cuota", "Lo que se cobra cada vez. En frecuencia fecha, el monto de ese único día.", 12, True),
        ("cuota_domingo", "Solo si el domingo de este plan es otra cifra. Si no, 0.", 16, False),
        ("fecha", "dia o domingo: primer día. fecha: el único día. semana, quincena o mes: el día ancla. Vacío en dia = desde que arranca el sistema.", 16, False),
        ("notas", "Opcional.", 28, False),
    ]
    ws_a = wb.create_sheet("Acuerdos")
    header(ws_a, acu_cols)
    paint_rows(ws_a, len(acu_cols), 2, 120)
    dv_list(ws_a, '"dia,domingo,semana,quincena,mes,fecha"', "F2:F120")
    for r in range(2, 121):
        ws_a.cell(r, 9).number_format = "YYYY-MM-DD"

    # Pendientes
    pen_cols = [
        ("empresa", "El mismo código de la hoja Empresa.", 14, True),
        ("numero_carro", "El mismo número de la hoja Carros.", 16, True),
        ("concepto", "domingo, mantenimiento, panapass, exceso_km, cierre_semana u otro.", 18, True),
        ("saldo", "Lo que falta de ese concepto. En domingo es el balde, no una tajada.", 14, True),
        ("descripcion", "Texto corto. En domingo puede ir «2 domingos».", 36, False),
    ]
    ws_p = wb.create_sheet("Pendientes")
    header(ws_p, pen_cols)
    paint_rows(ws_p, len(pen_cols), 2, 80)
    dv_list(ws_p, '"domingo,mantenimiento,panapass,exceso_km,cierre_semana,otro"', "C2:C80")

    # Ejemplo
    ws_x = wb.create_sheet("Ejemplo")
    ws_x.sheet_properties.tabColor = "D97706"
    ws_x.sheet_view.showGridLines = False
    ws_x.column_dimensions["A"].width = 22
    ws_x.column_dimensions["B"].width = 28
    ws_x.column_dimensions["C"].width = 36
    ws_x.column_dimensions["D"].width = 18
    ws_x.column_dimensions["E"].width = 18
    ws_x.column_dimensions["F"].width = 22
    ws_x.column_dimensions["G"].width = 16
    ws_x.column_dimensions["H"].width = 18
    ws_x["A1"] = "Ejemplo. No se carga. Sirve para ver el formato."
    ws_x["A1"].font = font_title
    ws_x.merge_cells("A1:H1")
    ws_x.row_dimensions[1].height = 28

    def seccion(row, titulo):
        ws_x.cell(row, 1, titulo).font = font_h2
        ws_x.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
        return row + 1

    def fila_h(row, labels):
        for i, lab in enumerate(labels, 1):
            cell = ws_x.cell(row, i, lab)
            cell.font = font_h
            cell.fill = fill_h
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws_x.row_dimensions[row].height = 22
        return row + 1

    def fila(row, vals):
        for i, v in enumerate(vals, 1):
            cell = ws_x.cell(row, i, v)
            cell.font = font_b
            cell.border = thin
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws_x.row_dimensions[row].height = 22
        return row + 1

    r = 3
    r = seccion(r, "Empresa")
    r = fila_h(r, ["empresa", "nombre", "prefijo", "desde", "hasta", "fecha_corte"])
    r = fila(r, ["NORTE", "Norte Rent", "N", 1, 40, "2026-09-30"])
    r += 1
    r = seccion(r, "Carros")
    r = fila_h(r, ["numero", "cliente", "telefono", "letra", "domingo", "tajada", "saldo letra", "estado"])
    r = fila(r, ["N01", "Ana Pérez", "60001111", 35, "SI", 30, 35, "activo"])
    r = fila(r, ["N02", "Luis Chen", "60002222", 30, "NO", 0, 0, "mantenimiento"])
    ws_x.cell(r - 1, 8).comment = comment("N02 entra a taller el 2026-10-02 y vuelve el 2026-10-06. Hasta el 1 de octubre se cobra normal.")
    r += 1
    r = seccion(r, "Acuerdos de N01")
    r = fila_h(r, ["orden", "descripcion", "saldo", "frecuencia", "cuota", "cuota domingo", "fecha"])
    r = fila(r, [1, "Acuerdo de pago", 200, "fecha", 200, 0, "2026-10-01"])
    r = fila(r, [2, "Acuerdo de pago", 100, "fecha", 100, 0, "2026-10-02"])
    r = fila(r, [3, "Recogida de vehículo", 50, "dia", 5, 30, ""])
    r += 1
    r = seccion(r, "Pendientes de N01")
    r = fila_h(r, ["concepto", "saldo", "descripcion"])
    r = fila(r, ["domingo", 60, "Dos tajadas de 30"])
    r += 1
    ws_x.cell(r, 1, "Cómo se lee N01 al día siguiente del corte").font = font_h2
    ws_x.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    r += 1
    texto = (
        "Saldo de letra $35: eso es lo atrasado, y entra al total. "
        "La letra nueva del día la pone el sistema, no esta hoja. "
        "Domingo: balde $60, pero hoy se cobra una tajada de $30, no los $60. "
        "Acuerdos: el de $200 no se cobra hasta el 1 de octubre; el de $100 espera; la recogida espera detrás de los dos. "
        "Ninguno de esos saldos se suma al saldo de letra."
    )
    ws_x.cell(r, 1, texto).font = font_small
    ws_x.cell(r, 1).alignment = wrap
    ws_x.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    ws_x.row_dimensions[r].height = 64

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
