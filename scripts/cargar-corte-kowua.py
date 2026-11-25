#!/usr/bin/env python3
"""
Deja Kowua en el corte de la plantilla (2026-10-06).

La hoja Empresa dejó la fecha de corte vacía. El saldo es el cerrado hoy,
el mismo día del corte de AutoLujo. Negativo = adelantado.
Acuerdos y pendientes no se mezclan con la letra.

No borra pagos. Quita los cargos viejos, fija saldo_inicial para que el
neto sea la hoja, y marca los días hábiles del corte para que el devengo
no vuelva a cargar esa letra.

No envía WhatsApp.

  python3 scripts/cargar-corte-kowua.py
  python3 scripts/cargar-corte-kowua.py --commit
"""
from __future__ import annotations

import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import openpyxl
import requests

COMMIT = "--commit" in sys.argv
EXCEL = Path("/Users/mateozuluagatoledo/Downloads/Plantilla carga empresa KW.xlsx")
CORTE = date(2026, 10, 6)
TAG = "corte Kowua 2026-10-06"

ROOT = Path(__file__).resolve().parent.parent
env: dict[str, str] = {}
for line in (ROOT / ".env.local").read_text().splitlines():
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v
URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

ESTADO = {
    "activo": "activo",
    "x entregar": "por_entregar",
    "por entregar": "por_entregar",
    "por_entregar": "por_entregar",
    "chapisteria": "chapisteria",
    "mecanica": "mantenimiento",
    "mantenimiento": "mantenimiento",
    "alistamiento": "por_entregar",
    "colision": "colision",
    "improductivo": "improductivo",
    "entregado": "entregado",
}


def sb_get(path: str):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=90)
    r.raise_for_status()
    return r.json()


def sb_get_all(path: str):
    out = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/{path}",
            headers={**H, "Range": f"{offset}-{offset + 999}"},
            timeout=90,
        )
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < 1000:
            return out
        offset += 1000


def sb_post(table: str, rows):
    if not rows:
        return []
    r = requests.post(f"{URL}/rest/v1/{table}", headers=H, json=rows, timeout=90)
    if r.status_code >= 300 and table == "clientes":
        limpio = [{k: v for k, v in row.items() if k not in ("genero", "cedula")} for row in rows]
        r = requests.post(f"{URL}/rest/v1/{table}", headers=H, json=limpio, timeout=90)
    if r.status_code >= 300:
        raise SystemExit(f"POST {table} {r.status_code} {r.text[:500]}")
    return r.json()


def sb_patch(table: str, filt: str, body: dict):
    r = requests.patch(f"{URL}/rest/v1/{table}?{filt}", headers=H, json=body, timeout=90)
    if r.status_code >= 300:
        raise SystemExit(f"PATCH {table} {r.status_code} {r.text[:500]}")
    return r.json()


def sb_delete(table: str, filt: str):
    r = requests.delete(f"{URL}/rest/v1/{table}?{filt}", headers=H, timeout=90)
    if r.status_code >= 300:
        raise SystemExit(f"DELETE {table} {r.status_code} {r.text[:400]}")


def num(v) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("$", "").replace(",", "").strip()
    try:
        return float(s) if s else 0.0
    except ValueError:
        return 0.0


def r2(n: float) -> float:
    return round(float(n) * 100) / 100


def digitos(n) -> str:
    t = re.sub(r"[^A-Z0-9]", "", str(n or "").upper())
    m = re.match(r"^([A-Z]*)0*(\d+)$", t)
    c = (m.group(1) + str(int(m.group(2)))) if m else t
    return re.sub(r"\D", "", c)


def fecha(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v or "")[:10]
    return s if re.match(r"\d{4}-\d{2}-\d{2}", s) else None


def tel(v) -> str | None:
    d = re.sub(r"\D", "", str(v or ""))
    if len(d) == 8:
        return "+507" + d
    if d.startswith("507") and len(d) == 11:
        return "+" + d
    return None


def estado_de(v: str) -> str:
    k = re.sub(r"\s+", " ", str(v or "").strip().lower())
    if k not in ESTADO:
        raise SystemExit(f"estado desconocido: {v!r}")
    return ESTADO[k]


def dias_marcados() -> list[str]:
    out = []
    for i in range(7, -1, -1):
        d = CORTE - timedelta(days=i)
        if d.weekday() != 6:
            out.append(d.isoformat())
    return out


CARGO = {
    "exceso_km": ("exceso_km", "122", "Exceso de kilometraje"),
    "mantenimiento": ("otras", "124", "Mantenimiento"),
    "panapass": ("panapass", "PANAPASS", "Panapass"),
    "domingo": ("otras", "DOMINGOS", "Domingos"),
    "cierre_semana": ("multa", "CIERRE_SEMANA", "Recargo Cierre semana"),
    "otro": ("ajuste", None, "Ajuste"),
}


def main():
    print("ESCRIBIENDO" if COMMIT else "DRY-RUN")
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    cars = []
    ws = wb["Carros"]
    for row in range(2, ws.max_row + 1):
        numero = ws.cell(row, 2).value
        if not numero:
            continue
        dom = str(ws.cell(row, 18).value or "").strip().upper()
        anio = ws.cell(row, 6).value
        cars.append({
            "numero": str(numero).strip(),
            "dig": digitos(numero),
            "placa": re.sub(r"\s+", "", str(ws.cell(row, 3).value or "").strip().upper()) or None,
            "marca": str(ws.cell(row, 4).value or "").strip() or None,
            "modelo": str(ws.cell(row, 5).value or "").strip() or None,
            "anio": int(anio) if isinstance(anio, (int, float)) else None,
            "estado": estado_de(str(ws.cell(row, 8).value or "")),
            "estado_hoja": str(ws.cell(row, 8).value or "").strip(),
            "taller": fecha(ws.cell(row, 9).value),
            "activa": fecha(ws.cell(row, 10).value),
            "nombre": re.sub(r"\s+", " ", str(ws.cell(row, 11).value or "").strip()),
            "cedula": str(ws.cell(row, 12).value or "").strip() or None,
            "tel": tel(ws.cell(row, 13).value),
            "genero": str(ws.cell(row, 14).value or "").strip().upper()[:1],
            "inicio": fecha(ws.cell(row, 16).value),
            "letra": r2(num(ws.cell(row, 17).value)),
            "cobra_domingo": dom == "SI",
            "tajada": r2(num(ws.cell(row, 19).value)),
            "cuotas": int(num(ws.cell(row, 20).value)) or None,
            "abono": r2(num(ws.cell(row, 22).value)),
            "saldo_vacio": ws.cell(row, 23).value is None or ws.cell(row, 23).value == "",
            "saldo": r2(num(ws.cell(row, 23).value)),
        })

    # El 201 está dos veces, misma placa. Me quedo con la fila que trae saldo.
    vistos: dict[str, dict] = {}
    orden: list[str] = []
    for c in cars:
        prev = vistos.get(c["dig"])
        if not prev:
            vistos[c["dig"]] = c
            orden.append(c["dig"])
            continue
        quedo, deje = (c, prev) if prev["saldo_vacio"] and not c["saldo_vacio"] else (prev, c)
        if prev["saldo_vacio"] == c["saldo_vacio"]:
            quedo, deje = c, prev
        vistos[c["dig"]] = quedo
        print(
            f"duplicado {c['dig']}: me quedo con {quedo['nombre'] or '(sin nombre)'} "
            f"saldo {quedo['saldo']} y dejo {deje['nombre'] or '(sin nombre)'} saldo {deje['saldo']}"
        )
    cars = [vistos[d] for d in orden]

    acus: dict[str, list] = {}
    ws = wb["Acuerdos"]
    for row in range(2, ws.max_row + 1):
        numero = ws.cell(row, 2).value
        if not numero:
            continue
        acus.setdefault(digitos(numero), []).append({
            "orden": int(num(ws.cell(row, 3).value) or 1),
            "desc": str(ws.cell(row, 4).value or "Acuerdo de pago").strip(),
            "saldo": r2(num(ws.cell(row, 5).value)),
            "freq": str(ws.cell(row, 6).value or "dia").strip().lower(),
            "cuota": r2(num(ws.cell(row, 7).value)),
            "cuota_dom": r2(num(ws.cell(row, 8).value)),
            "fecha": fecha(ws.cell(row, 9).value),
        })
    for xs in acus.values():
        xs.sort(key=lambda a: a["orden"])
    pens: dict[str, list] = {}
    ws = wb["Pendientes"]
    for row in range(2, ws.max_row + 1):
        numero = ws.cell(row, 2).value
        if not numero:
            continue
        concepto = str(ws.cell(row, 3).value or "otro").strip().lower()
        pens.setdefault(digitos(numero), []).append({
            "concepto": concepto,
            "saldo": r2(num(ws.cell(row, 4).value)),
            "desc": ws.cell(row, 5).value,
        })

    emp = sb_get("empresas?codigo=eq.KOWUA&select=id,codigo,nombre")[0]
    print("empresa", emp["codigo"], emp["nombre"])
    emp_id = emp["id"]
    vehs = sb_get(f"vehiculos?empresa_id=eq.{emp_id}&select=id,numero,estado,placa")
    by_dig: dict[str, list] = {}
    for v in vehs:
        by_dig.setdefault(digitos(v["numero"]), []).append(v)
    print("flota en base", len(vehs), "filas de hoja", len(cars))

    todos_ids = [v["id"] for vs in by_dig.values() for v in vs]
    cons_all = []
    if todos_ids:
        cons_all = sb_get(
            "contratos?select=id,cliente_id,estado,saldo_inicial,vehiculo_id"
            f"&estado=eq.activo&vehiculo_id=in.({','.join(todos_ids)})"
        )
    por_vehiculo: dict[str, list] = {}
    for con in cons_all:
        por_vehiculo.setdefault(con["vehiculo_id"], []).append(con)
    pagos_por: dict[str, float] = {}
    ids = [c["id"] for c in cons_all]
    for i in range(0, len(ids), 40):
        chunk = ",".join(ids[i : i + 40])
        for p in sb_get_all(
            "pagos?select=contrato_id,monto,estado_conciliacion"
            f"&contrato_id=in.({chunk})"
        ):
            if p["estado_conciliacion"] not in ("conciliado", "manual"):
                continue
            pagos_por[p["contrato_id"]] = r2(pagos_por.get(p["contrato_id"], 0) + float(p["monto"] or 0))
    marcados = dias_marcados()
    print("marcas de renta", marcados, "contratos activos", len(cons_all))

    ok = 0
    saltados = []
    adelantados = []
    creados_veh = 0
    for c in cars:
        hits = by_dig.get(c["dig"], [])
        if len(hits) > 1:
            saltados.append(f"{c['numero']} hay {len(hits)} carros con ese número")
            continue
        v = hits[0] if hits else None
        if not v:
            if not COMMIT:
                print(f"CREAR carro {c['dig']} {c['placa']} {c['nombre'] or '(sin cliente)'} {c['estado']}")
                creados_veh += 1
                if c["nombre"]:
                    ok += 1
                    if c["saldo"] < -0.009:
                        adelantados.append((c["dig"], c["saldo"], c["letra"]))
                else:
                    saltados.append(f"{c['numero']} carro nuevo sin cliente ({c['estado']})")
                continue
            cuerpo = {
                "empresa_id": emp_id,
                "numero": c["dig"],
                "estado": c["estado"],
            }
            if c["placa"]:
                cuerpo["placa"] = c["placa"]
            if c["marca"]:
                cuerpo["marca"] = c["marca"]
            if c["modelo"]:
                cuerpo["modelo"] = c["modelo"]
            if c["anio"]:
                cuerpo["anio"] = c["anio"]
            creado = sb_post("vehiculos", [cuerpo])
            v = {"id": creado[0]["id"], "numero": c["dig"]}
            by_dig[c["dig"]] = [v]
            creados_veh += 1

        cons = por_vehiculo.get(v["id"], [])
        if len(cons) > 1:
            saltados.append(f"{c['numero']} tiene {len(cons)} contratos activos")
            continue
        if len(cons) != 1:
            if not c["nombre"]:
                if COMMIT:
                    sb_patch("vehiculos", f"id=eq.{v['id']}", {"estado": c["estado"]})
                    if c["estado"] in ("chapisteria", "mantenimiento"):
                        escribir_pausa(v["id"], c)
                saltados.append(f"{c['numero']} sin contrato y sin cliente ({c['estado']})")
                continue
            if not COMMIT:
                print(f"CREAR contrato {c['dig']} {c['nombre']} letra {c['letra']} saldo {c['saldo']}")
                ok += 1
                if c["saldo"] < -0.009:
                    adelantados.append((c["dig"], c["saldo"], c["letra"]))
                continue
            cli_body = {"nombre": c["nombre"]}
            if c["tel"]:
                cli_body["whatsapp"] = c["tel"]
                cli_body["telefono"] = c["tel"]
            if c["cedula"]:
                cli_body["cedula"] = c["cedula"]
            if c["genero"] in ("M", "F"):
                cli_body["genero"] = c["genero"]
            creado_cli = sb_post("clientes", [cli_body])
            cliente_id = creado_cli[0]["id"]
            con_body = {
                "cliente_id": cliente_id,
                "vehiculo_id": v["id"],
                "empresa_id": emp_id,
                "fecha_inicio": c["inicio"] or CORTE.isoformat(),
                "letra_diaria": c["letra"],
                "saldo_inicial": c["saldo"],
                "estado": "activo",
                "cobra_domingo": c["cobra_domingo"],
                "cuota_domingo": c["tajada"] if c["cobra_domingo"] else 0,
            }
            if c["cuotas"]:
                con_body["num_cuotas_total"] = c["cuotas"]
            if c["abono"]:
                con_body["abono_inicial"] = c["abono"]
            creado_con = sb_post("contratos", [con_body])
            con = {"id": creado_con[0]["id"], "cliente_id": cliente_id}
            por_vehiculo[v["id"]] = [con]
        else:
            con = cons[0]

        pagado = pagos_por.get(con["id"], 0.0)
        extras = r2(sum(p["saldo"] for p in pens.get(c["dig"], []) if p["saldo"] > 0.009))
        saldo_inicial = r2(c["saldo"] + pagado)
        planes = acus.get(c["dig"], [])
        print(
            f"{c['dig']:>4} letra {c['saldo']:>8} extras {extras:>7} "
            f"pagos {pagado:>8} saldo_inicial {saldo_inicial:>8} "
            f"acuerdos {len(planes)} est {c['estado']} dom {c['tajada'] if c['cobra_domingo'] else 0}"
        )
        if c["saldo"] < -0.009:
            adelantados.append((c["dig"], c["saldo"], c["letra"]))
        if not COMMIT:
            ok += 1
            continue

        sb_delete("cargos", f"contrato_id=eq.{con['id']}")
        patch = {
            "saldo_inicial": saldo_inicial,
            "letra_diaria": c["letra"],
            "cobra_domingo": c["cobra_domingo"],
            "cuota_domingo": c["tajada"] if c["cobra_domingo"] else 0,
            "estado": "activo",
        }
        if c["inicio"]:
            patch["fecha_inicio"] = c["inicio"]
        if c["cuotas"]:
            patch["num_cuotas_total"] = c["cuotas"]
        if c["abono"]:
            patch["abono_inicial"] = c["abono"]
        sb_patch("contratos", f"id=eq.{con['id']}", patch)
        veh_patch = {"estado": c["estado"]}
        if c["placa"]:
            veh_patch["placa"] = c["placa"]
        if c["marca"]:
            veh_patch["marca"] = c["marca"]
        if c["modelo"]:
            veh_patch["modelo"] = c["modelo"]
        if c["anio"]:
            veh_patch["anio"] = c["anio"]
        sb_patch("vehiculos", f"id=eq.{v['id']}", veh_patch)
        if c["nombre"] or c["tel"] or c["cedula"]:
            cli = {}
            if c["nombre"]:
                cli["nombre"] = c["nombre"]
            if c["tel"]:
                cli["whatsapp"] = c["tel"]
                cli["telefono"] = c["tel"]
            if c["cedula"]:
                cli["cedula"] = c["cedula"]
            if c["genero"] in ("M", "F"):
                cli["genero"] = c["genero"]
            if cli and con.get("cliente_id"):
                try:
                    sb_patch("clientes", f"id=eq.{con['cliente_id']}", cli)
                except SystemExit:
                    cli.pop("genero", None)
                    if cli:
                        sb_patch("clientes", f"id=eq.{con['cliente_id']}", cli)

        rentas = [
            {
                "contrato_id": con["id"],
                "fecha": f,
                "tipo": "renta",
                "concepto": TAG,
                "monto": 0,
            }
            for f in marcados
        ]
        sb_post("cargos", rentas)
        extra_rows = []
        for p in pens.get(c["dig"], []):
            if p["saldo"] <= 0.009:
                continue
            tipo, codigo, nombre = CARGO.get(p["concepto"], CARGO["otro"])
            row = {
                "contrato_id": con["id"],
                "fecha": CORTE.isoformat(),
                "tipo": tipo,
                "concepto": (str(p["desc"]).strip() if p["desc"] else nombre) + f" · {TAG}",
                "monto": p["saldo"],
            }
            if codigo:
                row["concepto_codigo"] = codigo
            extra_rows.append(row)
        sb_post("cargos", extra_rows)

        sb_patch("acuerdos", f"contrato_id=eq.{con['id']}&activo=eq.true", {"activo": False})
        base = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
        nuevos = []
        for i, a in enumerate(planes):
            if a["saldo"] <= 0.009:
                continue
            fila = {
                "contrato_id": con["id"],
                "tipo": "dano",
                "descripcion": f"{a['desc']} · {TAG}",
                "monto_total": a["saldo"],
                "saldo": a["saldo"],
                "cuota_diaria": a["cuota"],
                "cuota_domingo": a["cuota_dom"] if a["cuota_dom"] > 0 else 30,
                "frecuencia": a["freq"] or "dia",
                "activo": True,
                "created_at": (base + timedelta(seconds=i)).isoformat(),
            }
            if a["fecha"]:
                fila["fecha_especifica"] = a["fecha"]
            nuevos.append(fila)
        sb_post("acuerdos", nuevos)
        if c["estado"] in ("chapisteria", "mantenimiento"):
            escribir_pausa(v["id"], c)
        ok += 1

    print(f"\nlistos {ok}  saltados {len(saltados)}  carros nuevos {creados_veh}")
    for s in saltados:
        print("  ", s)
    print("adelantados", len(adelantados))
    for n, saldo, letra in adelantados:
        dias = abs(saldo) / letra if letra else 0
        print(f"  {n} {saldo} letra {letra} ≈ {dias:.1f} cuotas")


def escribir_pausa(vehiculo_id: str, c: dict):
    desde = c["taller"] or CORTE.isoformat()
    hasta = c["activa"]
    detalle = (
        f"pausa-productiva:{c['estado']}:{hasta}" if hasta else f"pausa-productiva:{c['estado']}"
    )
    titulo = "Chapistería" if c["estado"] == "chapisteria" else "Mantenimiento"
    sb_post("vehiculo_eventos", [{
        "vehiculo_id": vehiculo_id,
        "fecha": desde,
        "tipo": "chapisteria" if c["estado"] == "chapisteria" else "novedad",
        "titulo": titulo,
        "detalle": detalle,
        "origen": "manual",
    }])


if __name__ == "__main__":
    main()
