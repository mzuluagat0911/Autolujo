#!/usr/bin/env python3
"""
Sincroniza flota GOLD desde el Excel del equipo.

Fuente: ~/Downloads/GOLD PARA MATEO.xlsx (hoja GOLD)

Actualiza:
  - clientes (nombre, teléfono, whatsapp)
  - contratos (letra, abono, fecha_inicio, num_cuotas_total)
  - traspasos cuando cambia el conductor del carro
  - altas G08 / G46–G50
  - acuerdos (DEBE ACUERDO)
  - cargos de otros/domingos/mantenimiento (DEBE OTROS RECARGOS)

NO toca saldo_inicial ni el ledger de renta/pagos (FALTANTES = cuotas
restantes del plan, no atraso en $).

Uso:
  python3 scripts/actualizar-gold.py              # dry-run
  python3 scripts/actualizar-gold.py --commit     # escribe
"""
from __future__ import annotations

import os
import re
import sys
import warnings
from datetime import date, datetime
from pathlib import Path

warnings.filterwarnings("ignore")
import openpyxl
import requests

COMMIT = "--commit" in sys.argv
EXCEL = Path.home() / "Downloads" / "GOLD PARA MATEO (1).xlsx"
if not EXCEL.exists():
    EXCEL = Path.home() / "Downloads" / "GOLD PARA MATEO.xlsx"
TAG_CARGO = "migrado Gold hoja 2026-09-22"
TAG_ACUERDO = "Acuerdo migrado Gold (hoja 2026-09-22)"

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
    "Content_Type": "application/json",
    "Prefer": "return=representation",
}
# requests header key
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def sb_get(path: str):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H)
    r.raise_for_status()
    return r.json()


def sb_post(table: str, rows):
    if not rows:
        return []
    r = requests.post(f"{URL}/rest/v1/{table}", headers=H, json=rows)
    if r.status_code >= 300:
        print(f"  ERR POST {table} {r.status_code} {r.text[:400]}")
        return []
    return r.json()


def sb_patch(table: str, filt: str, body: dict):
    r = requests.patch(f"{URL}/rest/v1/{table}?{filt}", headers=H, json=body)
    if r.status_code >= 300:
        print(f"  ERR PATCH {table}?{filt} {r.status_code} {r.text[:400]}")
        return []
    return r.json()


def num(v) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


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


def parse_excel(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["GOLD"]
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not r[0]:
            continue
        unidad = str(r[0]).strip().upper()
        if not re.match(r"^G\d{2}$", unidad):
            print(f"  ⚠️  unidad rara saltada: {unidad!r}")
            continue
        nota_tipo = str(r[11]).strip().upper() if r[11] else ""
        # En GOLD PARA MATEO (1).xlsx la col M (índice 12) es el monto del
        # último pago (header = fecha), NO una nota libre. Solo tomamos texto
        # claro de notas (ADELANTADO, ANEXO, etc.) si aparece más a la derecha.
        nota_libre = ""
        for cell in r[14:]:
            if cell is None:
                continue
            if isinstance(cell, (int, float)):
                continue
            t = str(cell).strip()
            if not t:
                continue
            # etiquetas de desglose del pago, no notas de cliente
            if t.lower() in {
                "menor edad",
                "abono inicial",
                "domingo",
                "acuerdo",
                "mantenimiento",
            }:
                continue
            if t.lower().startswith("multa"):
                continue
            nota_libre = t
            break
        out.append(
            {
                "unidad": unidad,
                "nombre": clean_name(r[1]),
                "telefono": str(int(r[2])) if isinstance(r[2], float) else str(r[2] or "").strip(),
                "whatsapp": normalizar_tel(r[2]),
                "fecha_inicio": fecha_iso(r[3]),
                "abono": num(r[4]),
                "letra": num(r[5]),
                "cuotas_total": int(round(num(r[6]))) if num(r[6]) else 1275,
                "cuotas_pagas": num(r[7]),
                "faltantes": num(r[8]),
                "debe_acuerdo": num(r[9]),
                "debe_otros": num(r[10]),
                "nota_tipo": nota_tipo,  # DOMINGOS / MANTENIMIENTO / MENOR EDAD
                "nota_libre": nota_libre,
                "pago_ayer": num(r[12]) if len(r) > 12 else 0.0,
            }
        )
    return out


def main():
    if not EXCEL.exists():
        print(f"No encuentro {EXCEL}")
        sys.exit(1)

    filas = parse_excel(EXCEL)
    print(f"\n{'=' * 60}")
    print("ESCRIBIENDO A SUPABASE" if COMMIT else "DRY-RUN (no escribe)")
    print(f"{'=' * 60}")
    print(f"Excel: {EXCEL.name} · {len(filas)} filas GOLD\n")

    emp = sb_get("empresas?codigo=eq.GOLD&select=id,codigo")[0]
    gold_id = emp["id"]

    vehiculos = {
        v["numero"]: v
        for v in sb_get(
            f"vehiculos?empresa_id=eq.{gold_id}&select=id,numero,estado&order=numero"
        )
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

    # índice clientes por wa_norm (todos, no solo gold) para reusar si ya existen
    clientes_all = sb_get("clientes?select=id,nombre,telefono,whatsapp,codigo,wa_norm&limit=5000")
    por_wa: dict[str, dict] = {}
    for c in clientes_all:
        n = c.get("wa_norm") or wa_norm(c.get("whatsapp"))
        if n:
            por_wa[n] = c

    stats = {
        "cliente_nuevo": 0,
        "cliente_upd": 0,
        "contrato_upd": 0,
        "traspaso": 0,
        "contrato_nuevo": 0,
        "acuerdo": 0,
        "cargo_otros": 0,
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
        """Devuelve cliente_id (o None en dry-run si sería nuevo)."""
        wa = row["whatsapp"]
        n = wa_norm(wa)
        existente = por_wa.get(n) if n else None

        # Mismo conductor, teléfono nuevo (ej. G42): reusar el del contrato activo.
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
                plan.append(f"  CLI upd {row['unidad']}: {existente.get('nombre')} → {cambios}")
                stats["cliente_upd"] += 1
                if COMMIT:
                    sb_patch("clientes", f"id=eq.{existente['id']}", cambios)
                    existente.update(cambios)
                    if n:
                        por_wa[n] = existente
            return existente["id"]

        codigo = f"GD-{row['unidad']}"
        body["codigo"] = codigo
        plan.append(f"  CLI + {row['unidad']}: {row['nombre']} {wa} ({codigo})")
        stats["cliente_nuevo"] += 1
        if not COMMIT:
            return f"dry:{row['unidad']}"  # marcador: cliente nuevo en dry-run
        created = sb_post("clientes", [body])
        if not created:
            return None
        cid = created[0]["id"]
        if n:
            por_wa[n] = created[0]
        return cid

    def sync_acuerdo(contrato_id: str, debe: float, unidad: str):
        existentes = sb_get(
            f"acuerdos?contrato_id=eq.{contrato_id}&select=id,saldo,activo,descripcion"
        )
        migrados = [a for a in existentes if TAG_ACUERDO in (a.get("descripcion") or "")]
        if debe <= 0.009:
            for a in migrados:
                if a.get("activo"):
                    plan.append(f"  ACUERDO off {unidad}: ${a['saldo']}")
                    if COMMIT:
                        sb_patch("acuerdos", f"id=eq.{a['id']}", {"activo": False, "saldo": 0})
            return
        if migrados:
            a = migrados[0]
            if abs(num(a["saldo"]) - debe) > 0.009 or not a.get("activo"):
                plan.append(f"  ACUERDO set {unidad}: ${debe:.2f}")
                stats["acuerdo"] += 1
                if COMMIT:
                    sb_patch(
                        "acuerdos",
                        f"id=eq.{a['id']}",
                        {"saldo": debe, "monto_total": max(debe, num(a.get("saldo"))), "activo": True},
                    )
            return
        plan.append(f"  ACUERDO + {unidad}: ${debe:.2f}")
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
                        "cuota_diaria": 5,
                        "cuota_domingo": 30,
                        "activo": True,
                    }
                ],
            )

    def sync_otros(contrato_id: str, debe: float, nota_tipo: str, unidad: str):
        existentes = sb_get(
            f"cargos?contrato_id=eq.{contrato_id}&concepto=ilike.*{TAG_CARGO}*&select=id,monto,concepto,tipo"
        )
        if debe <= 0.009:
            for g in existentes:
                plan.append(f"  CARGO del {unidad}: {g['concepto']} ${g['monto']}")
                if COMMIT:
                    requests.delete(
                        f"{URL}/rest/v1/cargos?id=eq.{g['id']}",
                        headers={k: v for k, v in H.items() if k != "Prefer"},
                    )
            return

        if nota_tipo == "MANTENIMIENTO":
            tipo, concepto_codigo, label = "multa", "124", "Mantenimiento"
        elif nota_tipo == "DOMINGOS":
            tipo, concepto_codigo, label = "otras", None, "Domingos pendientes"
        else:
            tipo, concepto_codigo, label = "otras", None, "Otros recargos"

        concepto = f"{label} ({TAG_CARGO})"
        if len(existentes) == 1 and abs(num(existentes[0]["monto"]) - debe) < 0.009:
            return
        for g in existentes:
            if COMMIT:
                requests.delete(
                    f"{URL}/rest/v1/cargos?id=eq.{g['id']}",
                    headers={k: v for k, v in H.items() if k != "Prefer"},
                )
        plan.append(f"  CARGO + {unidad}: {concepto} ${debe:.2f}")
        stats["cargo_otros"] += 1
        if COMMIT:
            body = {
                "contrato_id": contrato_id,
                "fecha": date.today().isoformat(),
                "tipo": tipo,
                "concepto": concepto,
                "monto": debe,
            }
            if concepto_codigo:
                body["concepto_codigo"] = concepto_codigo
            sb_post("cargos", [body])

    for row in filas:
        u = row["unidad"]
        veh = vehiculos.get(u)
        if not veh:
            plan.append(f"❌ {u}: no hay vehículo GOLD en DB — crear a mano")
            stats["veh_faltante"] += 1
            continue

        act = activo_por_carro.get(u)
        cli_id = ensure_cliente(row, act)

        patch_con = {
            "letra_diaria": row["letra"],
            "abono_inicial": row["abono"],
            "num_cuotas_total": row["cuotas_total"],
        }
        if row["fecha_inicio"]:
            patch_con["fecha_inicio"] = row["fecha_inicio"]
        if row["nota_tipo"] == "DOMINGOS" or (
            row["debe_otros"] > 0 and row["nota_tipo"] == "DOMINGOS"
        ):
            patch_con["cobra_domingo"] = True
            patch_con["cuota_domingo"] = 30

        if not act:
            plan.append(
                f"  CONTRATO + {u}: {row['nombre']} letra ${row['letra']:.0f} "
                f"abono ${row['abono']:.0f} desde {row['fecha_inicio']}"
            )
            stats["contrato_nuevo"] += 1
            contrato_id = None
            if COMMIT and cli_id and not str(cli_id).startswith("dry:"):
                created = sb_post(
                    "contratos",
                    [
                        {
                            "vehiculo_id": veh["id"],
                            "cliente_id": cli_id,
                            "empresa_id": gold_id,
                            "estado": "activo",
                            "saldo_inicial": 0,
                            "descuento_puntual": 5,
                            "cobra_domingo": bool(patch_con.get("cobra_domingo")),
                            "cuota_domingo": patch_con.get("cuota_domingo", 0),
                            **{
                                k: patch_con[k]
                                for k in (
                                    "letra_diaria",
                                    "abono_inicial",
                                    "num_cuotas_total",
                                    "fecha_inicio",
                                )
                                if k in patch_con
                            },
                        }
                    ],
                )
                contrato_id = created[0]["id"] if created else None
            if contrato_id:
                sync_acuerdo(contrato_id, row["debe_acuerdo"], u)
                sync_otros(contrato_id, row["debe_otros"], row["nota_tipo"], u)
            elif not COMMIT:
                if row["debe_acuerdo"] > 0:
                    plan.append(f"  ACUERDO + {u}: ${row['debe_acuerdo']:.2f}")
                    stats["acuerdo"] += 1
                if row["debe_otros"] > 0:
                    plan.append(
                        f"  CARGO + {u}: {row['nota_tipo'] or 'otros'} ${row['debe_otros']:.2f}"
                    )
                    stats["cargo_otros"] += 1
            continue

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

        if mismo:
            # actualizar términos
            diffs = []
            if abs(num(act["letra_diaria"]) - row["letra"]) > 0.009:
                diffs.append(f"letra {act['letra_diaria']}→{row['letra']}")
            if abs(num(act["abono_inicial"]) - row["abono"]) > 0.009:
                diffs.append(f"abono {act['abono_inicial']}→{row['abono']}")
            if (act.get("num_cuotas_total") or None) != row["cuotas_total"]:
                diffs.append(f"cuotas→{row['cuotas_total']}")
            if row["fecha_inicio"] and act.get("fecha_inicio") != row["fecha_inicio"]:
                diffs.append(f"inicio {act.get('fecha_inicio')}→{row['fecha_inicio']}")
            if patch_con.get("cobra_domingo") and not act.get("cobra_domingo"):
                diffs.append("cobra_domingo=on")
            if diffs:
                plan.append(f"  CONTRATO upd {u}: {', '.join(diffs)}")
                stats["contrato_upd"] += 1
                if COMMIT:
                    sb_patch("contratos", f"id=eq.{act['id']}", patch_con)
            sync_acuerdo(act["id"], row["debe_acuerdo"], u)
            sync_otros(act["id"], row["debe_otros"], row["nota_tipo"], u)
        else:
            old_nom = (act.get("cliente") or {}).get("nombre")
            plan.append(
                f"  TRASPASO {u}: {old_nom} → {row['nombre']} "
                f"(letra ${row['letra']:.0f}, desde {row['fecha_inicio']})"
            )
            stats["traspaso"] += 1
            nuevo_id = None
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
                            "saldo_inicial": 0,
                            "descuento_puntual": 5,
                            "cobra_domingo": bool(patch_con.get("cobra_domingo")),
                            "cuota_domingo": patch_con.get("cuota_domingo", 0),
                            **{
                                k: patch_con[k]
                                for k in (
                                    "letra_diaria",
                                    "abono_inicial",
                                    "num_cuotas_total",
                                    "fecha_inicio",
                                )
                                if k in patch_con
                            },
                        }
                    ],
                )
                nuevo_id = created[0]["id"] if created else None
            if nuevo_id:
                sync_acuerdo(nuevo_id, row["debe_acuerdo"], u)
                sync_otros(nuevo_id, row["debe_otros"], row["nota_tipo"], u)
            elif not COMMIT:
                if row["debe_acuerdo"] > 0:
                    plan.append(f"  ACUERDO + {u}: ${row['debe_acuerdo']:.2f}")
                    stats["acuerdo"] += 1
                if row["debe_otros"] > 0:
                    plan.append(
                        f"  CARGO + {u}: {row['nota_tipo'] or 'otros'} ${row['debe_otros']:.2f}"
                    )
                    stats["cargo_otros"] += 1

    print("\n".join(plan) if plan else "(sin cambios)")
    print(f"\nResumen: {stats}")
    if not COMMIT:
        print("\n👉 Si cuadra, corre: python3 scripts/actualizar-gold.py --commit")
    else:
        print("\n✅ Sync GOLD aplicado.")


if __name__ == "__main__":
    main()
