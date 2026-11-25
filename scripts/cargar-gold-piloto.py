#!/usr/bin/env python3
"""
Carga el piloto GOLD desde Excel (8) a Supabase — ledger + flota + alcance.

Fuente: ~/Downloads/GOLD PARA MATEO (8).xlsx
Criterios: mismos del agente / motor (prioridad-extras, cuota, adelantado).

Qué hace:
  1. Sincroniza clientes, contratos, acuerdos, cargos "otros" (domingo/mant).
  2. Limpia ledger viejo de contratos GOLD activos.
  3. Fija saldo_inicial = atrasado + falta letra 22 + $5 si faltó el 22
     (estado al cierre del 22 / arranque del 23). G33 cumple → sin arrastre 22.
  4. Registra pagos del 23 ya hechos (col. 23 + multa/acuerdo del adelanto).
  5. Abono restante (saldo abono) como acuerdo/cargo.
  6. Deja cartera_alcance = solo GOLD (inicio de empresa).

NO envía WhatsApp. NO crea rentas del 23 (las pone el cron/devengo).

Uso:
  python3 scripts/cargar-gold-piloto.py           # dry-run
  python3 scripts/cargar-gold-piloto.py --commit  # escribe
"""
from __future__ import annotations

import re
import sys
import warnings
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")
import openpyxl
import requests

COMMIT = "--commit" in sys.argv
EXCEL = Path.home() / "Downloads" / "GOLD PARA MATEO (8).xlsx"
TAG_CARGO = "piloto Gold 2026-09-23"
TAG_ACUERDO = "Acuerdo piloto Gold 2026-09-23"
TAG_ABONO = "Abono inicial restante (piloto Gold 2026-09-23)"
TAG_PAGO = "pago piloto Gold Excel (8)"
FECHA_22 = date(2026, 9, 22)
FECHA_23 = date(2026, 9, 23)
RECARGO = 5.0
CUMPLE_LIBRE_22 = {"G33"}

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


def sb_get(path: str):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=60)
    r.raise_for_status()
    return r.json()


def sb_post(table: str, rows):
    if not rows:
        return []
    r = requests.post(f"{URL}/rest/v1/{table}", headers=H, json=rows, timeout=60)
    if r.status_code >= 300:
        print(f"  ERR POST {table} {r.status_code} {r.text[:400]}")
        return []
    return r.json()


def sb_patch(table: str, filt: str, body: dict):
    r = requests.patch(f"{URL}/rest/v1/{table}?{filt}", headers=H, json=body, timeout=60)
    if r.status_code >= 300:
        print(f"  ERR PATCH {table}?{filt} {r.status_code} {r.text[:400]}")
        return []
    return r.json()


def sb_delete(table: str, filt: str):
    r = requests.delete(
        f"{URL}/rest/v1/{table}?{filt}",
        headers={k: v for k, v in H.items() if k != "Prefer"},
        timeout=60,
    )
    if r.status_code >= 300:
        print(f"  ERR DELETE {table}?{filt} {r.status_code} {r.text[:300]}")
        return False
    return True


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


def num_or_none(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("$", "").replace(",", "").strip()
    try:
        return float(s) if s else None
    except ValueError:
        return None


def money(n: float) -> str:
    v = round(float(n) * 100) / 100
    return "$" + (str(int(v)) if v == int(v) else f"{v:.2f}")


def normalizar_tel(t) -> str | None:
    d = re.sub(r"\D", "", str(t or ""))
    if not d:
        return None
    if len(d) == 8:
        return "+507" + d
    if d.startswith("507") and len(d) == 11:
        return "+" + d
    if 10 <= len(d) <= 15:
        return "+" + d
    return None


def wa_norm(wa: str | None) -> str | None:
    if not wa:
        return None
    d = re.sub(r"\D", "", wa)
    return d or None


def clean_name(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip())


def fecha_iso(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v)[:10]
    return s if re.match(r"\d{4}-\d{2}-\d{2}", s) else None


def parse_saldo_abono(v) -> tuple[float, float]:
    """(saldo_restante, cuota_diaria)."""
    if v is None or v == "":
        return 0.0, 0.0
    if isinstance(v, (int, float)):
        saldo = float(v)
        return saldo, (5.0 if saldo > 0.009 else 0.0)
    s = str(v).strip().lower()
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*paga\s*diario\s*(\d+(?:[.,]\d+)?)", s)
    if m:
        return float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
    m2 = re.search(r"(\d+(?:[.,]\d+)?)", s)
    if m2:
        saldo = float(m2.group(1).replace(",", "."))
        return saldo, (5.0 if saldo > 0.009 else 0.0)
    return 0.0, 0.0


def parse_excel(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["GOLD"]
    pago_c: dict[date, int] = {}
    atrasado_c = adelantado_c = None
    for c in range(1, ws.max_column + 1):
        h = ws.cell(1, c).value
        if isinstance(h, datetime):
            pago_c[h.date()] = c
        elif isinstance(h, date):
            pago_c[h] = c
        elif str(h or "").strip().lower() == "atrasado":
            atrasado_c = c
        elif "adelantado" in str(h or "").lower():
            adelantado_c = c

    c22 = pago_c[FECHA_22]
    c23 = pago_c[FECHA_23]
    out = []

    for r in range(2, ws.max_row + 1):
        unidad = str(ws.cell(r, 1).value or "").strip().upper()
        if not re.match(r"^G\d{2}$", unidad):
            if unidad:
                print(f"  ⚠️  unidad rara saltada: {unidad!r}")
            continue
        nombre = clean_name(ws.cell(r, 2).value)
        if not nombre:
            continue
        letra = num(ws.cell(r, 7).value)
        if letra <= 0:
            continue

        saldo_abono, cuota_abono = parse_saldo_abono(ws.cell(r, 6).value)
        nota_tipo = str(ws.cell(r, 13).value or "").strip().upper()
        pago_22 = num_or_none(ws.cell(r, c22).value)
        pago_23 = num_or_none(ws.cell(r, c23).value)
        atrasado = num_or_none(ws.cell(r, atrasado_c).value) if atrasado_c else None
        if atrasado is not None and abs(atrasado) < 0.009:
            atrasado = None
        adel_raw = num_or_none(ws.cell(r, adelantado_c).value) if adelantado_c else None
        credito = abs(float(adel_raw)) if adel_raw is not None and abs(adel_raw) > 0.009 else 0.0

        nota_libre = ""
        pago_multa = 0.0
        pago_acuerdo_extra = 0.0
        forzar_sin_cobro = False
        c = 19
        while c <= ws.max_column:
            v = ws.cell(r, c).value
            if v is None or str(v).strip() == "":
                c += 1
                continue
            if isinstance(v, str):
                up = v.upper()
                if (
                    "NO COBRAR" in up
                    or "PAGO ADELANTADO EL DIA 23" in up
                    or "PAGO ADELANTADO EL DÍA 23" in up
                ):
                    nota_libre = v.strip()
                    forzar_sin_cobro = True
                c += 1
                continue
            monto = num(v)
            nxt = ws.cell(r, c + 1).value
            lab = str(nxt or "").upper()
            if monto > 0 and isinstance(nxt, str) and nxt.strip():
                if any(k in lab for k in ("MULTA", "ATRDE", "ATARDE", "TARDE", "RECARGO")):
                    pago_multa += monto
                if "ACUERDO" in lab:
                    pago_acuerdo_extra += monto
                c += 2
                continue
            c += 1

        # --- falta 22 (criterio agente / Excel; no inventar otros días) ---
        cred = credito
        cumple = unidad in CUMPLE_LIBRE_22
        if cumple:
            falta_22 = 0.0
        elif pago_22 is not None and pago_22 + 0.009 >= letra:
            falta_22 = 0.0
        elif pago_22 is not None:
            falta_bruta = max(letra - pago_22, 0.0)
            aplicado = min(cred, falta_bruta)
            falta_22 = falta_bruta - aplicado
            cred -= aplicado
        else:
            if cred + 0.009 >= letra:
                falta_22 = 0.0
                cred -= letra
            elif cred > 0.009:
                falta_22 = letra - cred
                cred = 0.0
            else:
                falta_22 = letra

        recargo_22 = RECARGO if falta_22 > 0.009 else 0.0
        atr = atrasado if atrasado is not None else 0.0
        saldo_inicial = round(atr + falta_22 + recargo_22, 2)

        # Letra 23 ya cubierta en Excel
        letra_23_cubierta = False
        if pago_23 is not None and pago_23 + 0.009 >= letra:
            letra_23_cubierta = True
        elif cred + 0.009 >= letra:
            letra_23_cubierta = True
            cred -= letra

        # Monto a registrar como pago del 23 (letra + multa + acuerdo del adelanto)
        monto_pago_23 = 0.0
        if letra_23_cubierta:
            monto_pago_23 += letra
        if pago_multa > 0.009:
            monto_pago_23 += pago_multa
        if pago_acuerdo_extra > 0.009:
            monto_pago_23 += pago_acuerdo_extra
        # Crédito residual en col. adelantado (si sobró)
        if cred > 0.009:
            monto_pago_23 += cred

        debe_acuerdo = num(ws.cell(r, 11).value)
        # Si pagó acuerdo con el adelanto, el saldo Excel puede aún no restarlo
        debe_acuerdo_neto = max(debe_acuerdo - pago_acuerdo_extra, 0.0)

        out.append(
            {
                "unidad": unidad,
                "nombre": nombre,
                "telefono": str(int(ws.cell(r, 3).value))
                if isinstance(ws.cell(r, 3).value, float)
                else str(ws.cell(r, 3).value or "").strip(),
                "whatsapp": normalizar_tel(ws.cell(r, 3).value),
                "fecha_inicio": fecha_iso(ws.cell(r, 4).value),
                "abono": num(ws.cell(r, 5).value),
                "saldo_abono": saldo_abono,
                "cuota_abono": cuota_abono,
                "letra": letra,
                "cuotas_total": int(round(num(ws.cell(r, 8).value))) if num(ws.cell(r, 8).value) else 1275,
                "debe_acuerdo": debe_acuerdo_neto,
                "debe_acuerdo_bruto": debe_acuerdo,
                "debe_otros": num(ws.cell(r, 12).value),
                "nota_tipo": nota_tipo,
                "nota_libre": nota_libre,
                "forzar_sin_cobro": forzar_sin_cobro,
                "pago_22": pago_22,
                "pago_23": pago_23,
                "falta_22": falta_22,
                "recargo_22": recargo_22,
                "atrasado": atr,
                "saldo_inicial": saldo_inicial,
                "letra_23_cubierta": letra_23_cubierta,
                "monto_pago_23": round(monto_pago_23, 2),
                "pago_multa": pago_multa,
                "pago_acuerdo_extra": pago_acuerdo_extra,
                "credito_adel": credito,
            }
        )
    return out


def pagado_at_23() -> str:
    # 23-sep 10:00 Panamá = 15:00 UTC
    return "2026-09-23T15:00:00+00:00"


def main():
    if not EXCEL.exists():
        print(f"No encuentro {EXCEL}")
        sys.exit(1)

    filas = parse_excel(EXCEL)
    print(f"\n{'=' * 60}")
    print("ESCRIBIENDO A SUPABASE" if COMMIT else "DRY-RUN (no escribe)")
    print(f"{'=' * 60}")
    print(f"Excel: {EXCEL.name} · {len(filas)} filas · tag `{TAG_CARGO}`\n")

    emp = sb_get("empresas?codigo=eq.GOLD&select=id,codigo")[0]
    gold_id = emp["id"]

    vehiculos = {
        v["numero"]: v
        for v in sb_get(f"vehiculos?empresa_id=eq.{gold_id}&select=id,numero,estado&order=numero")
    }
    contratos = sb_get(
        "contratos?select=id,estado,fecha_inicio,letra_diaria,abono_inicial,"
        "saldo_inicial,num_cuotas_total,cobra_domingo,cuota_domingo,descuento_puntual,"
        "cliente_id,vehiculo_id,"
        "cliente:clientes(id,nombre,telefono,whatsapp,codigo,notas),"
        f"vehiculo:vehiculos!inner(id,numero)&vehiculo.empresa_id=eq.{gold_id}"
        "&estado=eq.activo"
    )
    activo_por_carro = {c["vehiculo"]["numero"]: c for c in contratos}

    clientes_all = sb_get("clientes?select=id,nombre,telefono,whatsapp,codigo,wa_norm,notas&limit=5000")
    por_wa: dict[str, dict] = {}
    for c in clientes_all:
        n = c.get("wa_norm") or wa_norm(c.get("whatsapp"))
        if n:
            por_wa[n] = c

    stats = {
        "cliente_upd": 0,
        "cliente_nuevo": 0,
        "contrato_upd": 0,
        "contrato_nuevo": 0,
        "acuerdo": 0,
        "cargo_otros": 0,
        "abono": 0,
        "saldo_ini": 0,
        "pagos_23": 0,
        "cargos_borrados": 0,
        "pagos_borrados": 0,
        "veh_faltante": 0,
    }
    plan: list[str] = []

    def names_match(a: str, b: str) -> bool:
        na = re.sub(r"[^A-Z0-9]", "", clean_name(a).upper())
        nb = re.sub(r"[^A-Z0-9]", "", clean_name(b).upper())
        if not na or not nb:
            return False
        return na == nb or na in nb or nb in na

    def ensure_cliente(row: dict, act: dict | None) -> str | None:
        wa = row["whatsapp"]
        n = wa_norm(wa)
        existente = por_wa.get(n) if n else None
        if not existente and act and act.get("cliente"):
            if names_match(act["cliente"].get("nombre") or "", row["nombre"]):
                existente = {
                    "id": act["cliente_id"],
                    "nombre": act["cliente"].get("nombre"),
                    "telefono": act["cliente"].get("telefono"),
                    "whatsapp": act["cliente"].get("whatsapp"),
                    "notas": act["cliente"].get("notas"),
                }

        body = {
            "nombre": row["nombre"],
            "telefono": row["telefono"] or None,
            "whatsapp": wa,
            "activo": True,
        }
        if row["nota_libre"]:
            body["notas"] = row["nota_libre"]

        if existente:
            cambios = {}
            if clean_name(existente.get("nombre") or "") != row["nombre"]:
                cambios["nombre"] = row["nombre"]
            if (existente.get("telefono") or "") != (row["telefono"] or ""):
                cambios["telefono"] = row["telefono"] or None
            if (existente.get("whatsapp") or "") != (wa or ""):
                cambios["whatsapp"] = wa
            if row["nota_libre"] and (existente.get("notas") or "") != row["nota_libre"]:
                cambios["notas"] = row["nota_libre"]
            if cambios:
                plan.append(f"  CLI upd {row['unidad']}: {cambios}")
                stats["cliente_upd"] += 1
                if COMMIT:
                    sb_patch("clientes", f"id=eq.{existente['id']}", cambios)
                    existente.update(cambios)
                    if n:
                        por_wa[n] = existente
            return existente["id"]

        body["codigo"] = f"GD-{row['unidad']}"
        plan.append(f"  CLI + {row['unidad']}: {row['nombre']} {wa}")
        stats["cliente_nuevo"] += 1
        if not COMMIT:
            return f"dry:{row['unidad']}"
        created = sb_post("clientes", [body])
        if not created:
            return None
        if n:
            por_wa[n] = created[0]
        return created[0]["id"]

    def sync_acuerdo(contrato_id: str, debe: float, unidad: str, cuota: float = 5.0):
        existentes = sb_get(
            f"acuerdos?contrato_id=eq.{contrato_id}&select=id,saldo,activo,descripcion,cuota_diaria"
        )
        migrados = [
            a
            for a in existentes
            if TAG_ACUERDO in (a.get("descripcion") or "")
            or "Acuerdo migrado Gold" in (a.get("descripcion") or "")
            or "piloto Gold" in (a.get("descripcion") or "")
        ]
        # Apagar acuerdos viejos de abono si vamos a recrear aparte
        if debe <= 0.009:
            for a in migrados:
                if TAG_ABONO in (a.get("descripcion") or ""):
                    continue
                if a.get("activo") or num(a.get("saldo")) > 0.009:
                    plan.append(f"  ACUERDO off {unidad}")
                    if COMMIT:
                        sb_patch("acuerdos", f"id=eq.{a['id']}", {"activo": False, "saldo": 0})
            return

        target = [a for a in migrados if TAG_ABONO not in (a.get("descripcion") or "")]
        if target:
            a = target[0]
            if abs(num(a["saldo"]) - debe) > 0.009 or not a.get("activo"):
                plan.append(f"  ACUERDO set {unidad}: {money(debe)}")
                stats["acuerdo"] += 1
                if COMMIT:
                    sb_patch(
                        "acuerdos",
                        f"id=eq.{a['id']}",
                        {
                            "saldo": debe,
                            "monto_total": max(debe, num(a.get("saldo"))),
                            "cuota_diaria": cuota,
                            "cuota_domingo": 30,
                            "activo": True,
                            "descripcion": TAG_ACUERDO,
                        },
                    )
            return
        plan.append(f"  ACUERDO + {unidad}: {money(debe)}")
        stats["acuerdo"] += 1
        if COMMIT:
            sb_post(
                "acuerdos",
                [
                    {
                        "contrato_id": contrato_id,
                        "tipo": "otro",
                        "descripcion": TAG_ACUERDO,
                        "monto_total": debe,
                        "saldo": debe,
                        "cuota_diaria": cuota,
                        "cuota_domingo": 30,
                        "activo": True,
                    }
                ],
            )

    def sync_abono(contrato_id: str, saldo: float, cuota: float, unidad: str):
        existentes = sb_get(
            f"acuerdos?contrato_id=eq.{contrato_id}&select=id,saldo,activo,descripcion"
        )
        migrados = [a for a in existentes if TAG_ABONO in (a.get("descripcion") or "")]
        if saldo <= 0.009:
            for a in migrados:
                if COMMIT:
                    sb_patch("acuerdos", f"id=eq.{a['id']}", {"activo": False, "saldo": 0})
            return
        if migrados:
            a = migrados[0]
            plan.append(f"  ABONO set {unidad}: {money(saldo)} /día {money(cuota)}")
            stats["abono"] += 1
            if COMMIT:
                sb_patch(
                    "acuerdos",
                    f"id=eq.{a['id']}",
                    {
                        "saldo": saldo,
                        "monto_total": max(saldo, num(a.get("saldo"))),
                        "cuota_diaria": cuota or 5,
                        "cuota_domingo": cuota or 5,
                        "activo": True,
                    },
                )
            return
        plan.append(f"  ABONO + {unidad}: {money(saldo)} /día {money(cuota or 5)}")
        stats["abono"] += 1
        if COMMIT:
            sb_post(
                "acuerdos",
                [
                    {
                        "contrato_id": contrato_id,
                        "tipo": "otro",
                        "descripcion": TAG_ABONO,
                        "monto_total": saldo,
                        "saldo": saldo,
                        "cuota_diaria": cuota or 5,
                        "cuota_domingo": cuota or 5,
                        "activo": True,
                    }
                ],
            )

    def sync_otros(contrato_id: str, debe: float, nota_tipo: str, unidad: str):
        # Borrar cargos migrados previos (cualquier tag Gold)
        existentes = sb_get(
            f"cargos?contrato_id=eq.{contrato_id}&select=id,monto,concepto,tipo"
        )
        migrados = [
            g
            for g in existentes
            if "Gold" in (g.get("concepto") or "")
            or "piloto Gold" in (g.get("concepto") or "")
            or "Domingos pendientes" in (g.get("concepto") or "")
            or "Mantenimiento" in (g.get("concepto") or "")
            or "Otros recargos" in (g.get("concepto") or "")
        ]
        if debe <= 0.009:
            for g in migrados:
                plan.append(f"  CARGO del {unidad}: {g['concepto']}")
                if COMMIT:
                    sb_delete("cargos", f"id=eq.{g['id']}")
            return

        nt = (nota_tipo or "").upper()
        if "MANTEN" in nt:
            tipo, codigo, label = "multa", "124", "Mantenimiento"
        elif "DOMINGO" in nt:
            tipo, codigo, label = "otras", "DOMINGOS", "Domingos pendientes"
        else:
            tipo, codigo, label = "otras", None, "Otros recargos"

        concepto = f"{label} ({TAG_CARGO})"
        vivos = [g for g in migrados if abs(num(g["monto"]) - debe) < 0.009 and label.split()[0].lower() in (g.get("concepto") or "").lower()]
        if len(vivos) == 1 and abs(num(vivos[0]["monto"]) - debe) < 0.009:
            return
        for g in migrados:
            if COMMIT:
                sb_delete("cargos", f"id=eq.{g['id']}")
        plan.append(f"  CARGO + {unidad}: {concepto} {money(debe)}")
        stats["cargo_otros"] += 1
        if COMMIT:
            body = {
                "contrato_id": contrato_id,
                "fecha": FECHA_22.isoformat(),
                "tipo": tipo,
                "concepto": concepto,
                "monto": debe,
            }
            if codigo:
                body["concepto_codigo"] = codigo
            sb_post("cargos", [body])

    def reset_ledger(contrato_id: str, unidad: str):
        """Borra renta/multas/pagos viejos; conserva nada — recreamos desde Excel."""
        cargos = sb_get(f"cargos?contrato_id=eq.{contrato_id}&select=id,concepto,tipo")
        # No borrar aún los que vamos a recrear en sync_otros — primero wipe total
        if cargos:
            plan.append(f"  LEDGER wipe {unidad}: {len(cargos)} cargos")
            stats["cargos_borrados"] += len(cargos)
            if COMMIT:
                for i in range(0, len(cargos), 40):
                    ids = [g["id"] for g in cargos[i : i + 40]]
                    sb_delete("cargos", f"id=in.({','.join(ids)})")
        pagos = sb_get(f"pagos?contrato_id=eq.{contrato_id}&select=id")
        if pagos:
            plan.append(f"  LEDGER wipe {unidad}: {len(pagos)} pagos")
            stats["pagos_borrados"] += len(pagos)
            if COMMIT:
                for i in range(0, len(pagos), 40):
                    ids = [p["id"] for p in pagos[i : i + 40]]
                    sb_delete("pagos", f"id=in.({','.join(ids)})")

    def set_saldo_inicial(contrato_id: str, monto: float, unidad: str):
        plan.append(f"  SALDO_INI {unidad}: {money(monto)}")
        stats["saldo_ini"] += 1
        if COMMIT:
            sb_patch("contratos", f"id=eq.{contrato_id}", {"saldo_inicial": monto})

    def registrar_pago_23(contrato_id: str, cliente_id: str | None, monto: float, unidad: str, detalle: str):
        if monto <= 0.009:
            return
        plan.append(f"  PAGO 23 {unidad}: {money(monto)} ({detalle})")
        stats["pagos_23"] += 1
        if COMMIT:
            sb_post(
                "pagos",
                [
                    {
                        "contrato_id": contrato_id,
                        "cliente_id": cliente_id,
                        "fecha": FECHA_23.isoformat(),
                        "pagado_at": pagado_at_23(),
                        "monto": monto,
                        "metodo": "transferencia",
                        "estado_conciliacion": "manual",
                        "notas": f"{TAG_PAGO} · {detalle}",
                        "origen": "oficina",
                    }
                ],
            )

    # --- Pass: sync cada fila ---
    for row in filas:
        u = row["unidad"]
        veh = vehiculos.get(u)
        if not veh:
            plan.append(f"❌ {u}: no hay vehículo GOLD en DB")
            stats["veh_faltante"] += 1
            continue

        act = activo_por_carro.get(u)
        cli_id = ensure_cliente(row, act)

        patch_con = {
            "letra_diaria": row["letra"],
            "abono_inicial": row["abono"],
            "num_cuotas_total": row["cuotas_total"],
            "descuento_puntual": 5,
            "saldo_inicial": row["saldo_inicial"],
        }
        if row["fecha_inicio"]:
            patch_con["fecha_inicio"] = row["fecha_inicio"]
        if "DOMINGO" in (row["nota_tipo"] or "") or (
            row["debe_otros"] > 0 and "DOMINGO" in (row["nota_tipo"] or "")
        ):
            patch_con["cobra_domingo"] = True
            patch_con["cuota_domingo"] = 30

        contrato_id = None
        if not act:
            plan.append(
                f"  CONTRATO + {u}: {row['nombre']} letra {money(row['letra'])} "
                f"saldo_ini {money(row['saldo_inicial'])}"
            )
            stats["contrato_nuevo"] += 1
            if COMMIT and cli_id and not str(cli_id).startswith("dry:"):
                created = sb_post(
                    "contratos",
                    [
                        {
                            "vehiculo_id": veh["id"],
                            "cliente_id": cli_id,
                            "empresa_id": gold_id,
                            "estado": "activo",
                            "cobra_domingo": bool(patch_con.get("cobra_domingo")),
                            "cuota_domingo": patch_con.get("cuota_domingo", 0),
                            **{
                                k: patch_con[k]
                                for k in (
                                    "letra_diaria",
                                    "abono_inicial",
                                    "num_cuotas_total",
                                    "fecha_inicio",
                                    "descuento_puntual",
                                    "saldo_inicial",
                                )
                                if k in patch_con
                            },
                        }
                    ],
                )
                contrato_id = created[0]["id"] if created else None
        else:
            contrato_id = act["id"]
            # ¿mismo cliente?
            act_wa = wa_norm((act.get("cliente") or {}).get("whatsapp"))
            row_wa = wa_norm(row["whatsapp"])
            mismo = bool(
                (cli_id and not str(cli_id).startswith("dry:") and act["cliente_id"] == cli_id)
                or (act_wa and row_wa and act_wa == row_wa)
                or (
                    cli_id
                    and not str(cli_id).startswith("dry:")
                    and names_match((act.get("cliente") or {}).get("nombre") or "", row["nombre"])
                )
            )
            if not mismo:
                plan.append(f"  TRASPASO {u}: {(act.get('cliente') or {}).get('nombre')} → {row['nombre']}")
                if COMMIT and cli_id and not str(cli_id).startswith("dry:"):
                    sb_patch("contratos", f"id=eq.{act['id']}", {"estado": "traspasado"})
                    created = sb_post(
                        "contratos",
                        [
                            {
                                "vehiculo_id": veh["id"],
                                "cliente_id": cli_id,
                                "empresa_id": gold_id,
                                "estado": "activo",
                                "cobra_domingo": bool(patch_con.get("cobra_domingo")),
                                "cuota_domingo": patch_con.get("cuota_domingo", 0),
                                **{
                                    k: patch_con[k]
                                    for k in (
                                        "letra_diaria",
                                        "abono_inicial",
                                        "num_cuotas_total",
                                        "fecha_inicio",
                                        "descuento_puntual",
                                        "saldo_inicial",
                                    )
                                    if k in patch_con
                                },
                            }
                        ],
                    )
                    contrato_id = created[0]["id"] if created else None
            else:
                plan.append(
                    f"  CONTRATO upd {u}: letra {money(row['letra'])} "
                    f"saldo_ini {money(row['saldo_inicial'])} "
                    f"(atr {money(row['atrasado'])} falta22 {money(row['falta_22'])} "
                    f"rec {money(row['recargo_22'])})"
                )
                stats["contrato_upd"] += 1
                if COMMIT:
                    sb_patch("contratos", f"id=eq.{contrato_id}", patch_con)

        if not contrato_id or str(contrato_id).startswith("dry:"):
            continue

        # Wipe ledger + recreate
        reset_ledger(contrato_id, u)
        set_saldo_inicial(contrato_id, row["saldo_inicial"], u)
        sync_acuerdo(contrato_id, row["debe_acuerdo"], u)
        sync_abono(contrato_id, row["saldo_abono"], row["cuota_abono"], u)
        sync_otros(contrato_id, row["debe_otros"], row["nota_tipo"], u)

        detalle_pago = []
        if row["letra_23_cubierta"]:
            detalle_pago.append(f"letra {money(row['letra'])}")
        if row["pago_multa"]:
            detalle_pago.append(f"multa {money(row['pago_multa'])}")
        if row["pago_acuerdo_extra"]:
            detalle_pago.append(f"acuerdo {money(row['pago_acuerdo_extra'])}")
        if row["forzar_sin_cobro"]:
            detalle_pago.append("sin_cobro_nota")
        registrar_pago_23(
            contrato_id,
            None if not cli_id or str(cli_id).startswith("dry:") else cli_id,
            row["monto_pago_23"],
            u,
            " + ".join(detalle_pago) or "adelanto",
        )

    # --- Alcance = solo GOLD ---
    plan.append(f"  ALCANCE → GOLD ({gold_id[:8]}…)")
    if COMMIT:
        actual = sb_get("cartera_alcance?select=empresa_id")
        if actual:
            ids = [a["empresa_id"] for a in actual]
            sb_delete("cartera_alcance", f"empresa_id=in.({','.join(ids)})")
        sb_post(
            "cartera_alcance",
            [{"empresa_id": gold_id, "updated_at": datetime.now(timezone.utc).isoformat()}],
        )

    print("\n".join(plan[:80]))
    if len(plan) > 80:
        print(f"  … +{len(plan) - 80} líneas")
    print(f"\nResumen: {stats}")

    # Totales esperados
    suma_ini = sum(r["saldo_inicial"] for r in filas)
    n_pago = sum(1 for r in filas if r["monto_pago_23"] > 0.009)
    n_sin = sum(1 for r in filas if r["forzar_sin_cobro"] or (r["letra_23_cubierta"] and r["saldo_inicial"] <= 0.009 and r["debe_acuerdo"] <= 0.009 and r["debe_otros"] <= 0.009))
    print(f"Suma saldo_inicial: {money(suma_ini)}")
    print(f"Con pago 23 registrado: {n_pago}")
    print(f"Sin cobro forzado (nota): {sum(1 for r in filas if r['forzar_sin_cobro'])}")

    if not COMMIT:
        print("\n👉 Si cuadra: python3 scripts/cargar-gold-piloto.py --commit")
    else:
        print("\n✅ Piloto GOLD cargado. Alcance = GOLD. Sin envíos WhatsApp.")


if __name__ == "__main__":
    main()
