#!/usr/bin/env python3
"""
Carga anclas de mantenimiento + km y última revisión mensual
desde el Excel del informe (MANTE, KIT Y REVSION).

Uso:
  python3 scripts/cargar-mantenimientos-informe.py
  python3 scripts/cargar-mantenimientos-informe.py --commit
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
import requests

COMMIT = "--commit" in sys.argv
ROOT = Path(__file__).resolve().parents[1]
EXCEL = Path.home() / "Downloads" / "MANTE, KIT Y REVSION 22 AL 28.xlsx"

env: dict[str, str] = {}
for line in (ROOT / ".env.local").read_text().splitlines():
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")

URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

MESES = {
    "ENERO": 1,
    "FEBRERO": 2,
    "MARZO": 3,
    "ABRIL": 4,
    "MAYO": 5,
    "JUNIO": 6,
    "JULIO": 7,
    "AGOSTO": 8,
    "AGOS": 8,
    "SEPTIEMBRE": 9,
    "SEPT": 9,
    "OCTUBRE": 10,
    "NOVIEMBRE": 11,
    "NOVIE,MBRE": 11,
    "NOVIEMBRE,": 11,
    "DICIEMBRE": 12,
}


def get_vehs(con_revision: bool) -> list[dict]:
    cols = "id,numero,km_actual,fecha_ultimo_mantenimiento,km_ultimo_mantenimiento,empresa:empresas(codigo)"
    if con_revision:
        cols = "id,numero,km_actual,fecha_ultimo_mantenimiento,km_ultimo_mantenimiento,fecha_ultima_revision,empresa:empresas(codigo)"
    r = requests.get(
        f"{URL}/rest/v1/vehiculos",
        params={"select": cols},
        headers=H,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def index_vehs(vehs: list[dict]) -> dict[str, list[dict]]:
    by: dict[str, list[dict]] = {}
    for v in vehs:
        n = str(v["numero"]).strip()
        by.setdefault(n, []).append(v)
        by.setdefault(n.upper(), []).append(v)
        if n.isdigit():
            by.setdefault(str(int(n)), []).append(v)
        if re.match(r"^G\d+$", n.upper()):
            g = "G" + n.upper()[1:].zfill(2)
            by.setdefault(g, []).append(v)
            by.setdefault(n.upper().lstrip("0") if False else n.upper(), []).append(v)
    return by


def resolve(unidad: str, by: dict[str, list[dict]], vehs: list[dict]) -> dict | None:
    u = str(unidad).strip().upper()
    if u.startswith("G") and u[1:].isdigit():
        key = "G" + u[1:].zfill(2)
        cands = by.get(key) or by.get(u) or []
        uniq = {c["id"]: c for c in cands}
        gold = [c for c in uniq.values() if (c.get("empresa") or {}).get("codigo") == "GOLD"]
        return (gold or list(uniq.values()) or [None])[0]

    n = str(int(u)) if u.isdigit() else u
    cands = by.get(n) or by.get(u) or []
    uniq = list({c["id"]: c for c in cands}.values())
    if not uniq:
        for v in vehs:
            if str(v["numero"]).strip() == n or str(v["numero"]).strip().upper() == u:
                uniq.append(v)
    if len(uniq) == 1:
        return uniq[0]
    if not uniq:
        return None
    ni = int(n) if n.isdigit() else 0
    if ni >= 100:
        return next((x for x in uniq if (x.get("empresa") or {}).get("codigo") == "KOWUA"), uniq[0])
    return next((x for x in uniq if (x.get("empresa") or {}).get("codigo") == "AUTOLUJO"), uniq[0])


def to_iso(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return None


def patch(vehiculo_id: str, body: dict, tiene_revision_col: bool) -> None:
    data = {k: v for k, v in body.items() if v is not None}
    if not tiene_revision_col:
        data.pop("fecha_ultima_revision", None)
    if not data:
        return
    r = requests.patch(
        f"{URL}/rest/v1/vehiculos",
        params={"id": f"eq.{vehiculo_id}"},
        headers=H,
        json=data,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"patch {vehiculo_id}: {r.status_code} {r.text[:300]}")
    r.raise_for_status()


def cargar_mantenimientos(wb, by, vehs) -> list[dict]:
    ws = wb["MANTENIMIENTOS"]
    out = []
    for r in range(2, (ws.max_row or 0) + 1):
        u = ws.cell(r, 1).value
        if u is None:
            continue
        cand = resolve(str(u), by, vehs)
        if not cand:
            out.append({"excel": str(u), "ok": False, "error": "sin match"})
            continue
        fecha = to_iso(ws.cell(r, 5).value)
        kil = ws.cell(r, 6).value
        nuevo = ws.cell(r, 3).value
        km_manto = int(round(float(kil))) if kil is not None and str(kil).strip() != "" else None
        # km_actual en DB es integer
        km_actual = int(round(float(nuevo))) if nuevo is not None else None
        if km_manto == 0:
            km_manto = None
        out.append(
            {
                "excel": str(u).strip().upper(),
                "ok": True,
                "id": cand["id"],
                "db": cand["numero"],
                "emp": (cand.get("empresa") or {}).get("codigo"),
                "fecha_ultimo_mantenimiento": fecha,
                "km_ultimo_mantenimiento": km_manto,
                "km_actual": km_actual,
            }
        )
    return out


def headers_meses(ws, header_row: int) -> list[tuple[int, int]]:
    """[(col, mes), ...] en orden de columnas."""
    out = []
    for c in range(1, (ws.max_column or 0) + 1):
        raw = ws.cell(header_row, c).value
        if raw is None:
            continue
        name = re.sub(r"\s+", "", str(raw).upper().replace(".", ","))
        # normalizar NOVIE,MBRE
        name = name.replace(",", "")
        for k, m in MESES.items():
            kk = k.replace(",", "")
            if name.startswith(kk) or kk.startswith(name[:3]) and len(name) >= 3:
                # match more carefully
                pass
        mes = None
        for k, m in MESES.items():
            kk = re.sub(r"[^A-Z]", "", k)
            nn = re.sub(r"[^A-Z]", "", name)
            if nn == kk or nn.startswith(kk) or kk.startswith(nn):
                mes = m
                break
        if mes:
            out.append((c, mes))
    return out


def ultima_revision_de_fila(ws, row: int, header_row: int, hoy: date) -> str | None:
    cols = headers_meses(ws, header_row)
    if not cols:
        return None
    # columnas con mes <= mes actual: año = hoy.year; si el mes es > mes actual, año-1
    fechas: list[date] = []
    for c, mes in cols:
        v = ws.cell(row, c).value
        if v is None:
            continue
        if isinstance(v, (datetime, date)):
            d = v.date() if isinstance(v, datetime) else v
            if d <= hoy:
                fechas.append(d)
            continue
        if isinstance(v, (int, float)) and 1 <= int(v) <= 31:
            dia = int(v)
            anio = hoy.year if mes <= hoy.month else hoy.year - 1
            try:
                d = date(anio, mes, dia)
            except ValueError:
                continue
            if d <= hoy:
                fechas.append(d)
        # texto MECANICA / oficina / chapisteria → ignorar
    if not fechas:
        return None
    return max(fechas).isoformat()


def cargar_revisiones(wb, by, vehs, hoy: date) -> dict[str, str]:
    """vehiculo_id -> fecha_ultima_revision ISO."""
    sheets = [
        ("REVSIONES AUTOLUJO", 1, "AUTOLUJO"),
        ("KOWUA", 2, "KOWUA"),
        ("GOLD", 1, "GOLD"),
    ]
    out: dict[str, str] = {}
    for name, header_row, emp_pref in sheets:
        if name not in wb.sheetnames:
            continue
        ws = wb[name]
        for r in range(header_row + 1, (ws.max_row or 0) + 1):
            u = ws.cell(r, 1).value
            if u is None:
                continue
            unidad = str(u).strip()
            if emp_pref == "GOLD" and not str(unidad).upper().startswith("G"):
                unidad = f"G{unidad}" if str(unidad).isdigit() else unidad
            cand = resolve(unidad, by, vehs)
            if not cand:
                # KW/AL numeric
                cand = resolve(str(u), by, vehs)
            if not cand:
                continue
            if emp_pref and (cand.get("empresa") or {}).get("codigo") != emp_pref:
                # si el match cayó en otra empresa, buscar explícito
                alt = [
                    v
                    for v in vehs
                    if (v.get("empresa") or {}).get("codigo") == emp_pref
                    and (
                        str(v["numero"]).strip() == str(cand["numero"]).strip()
                        or str(v["numero"]).strip().upper() == str(unidad).upper()
                        or str(v["numero"]).strip() == str(u).strip()
                    )
                ]
                if alt:
                    cand = alt[0]
            fecha = ultima_revision_de_fila(ws, r, header_row, hoy)
            if fecha:
                out[cand["id"]] = fecha
    return out


def main() -> None:
    if not EXCEL.exists():
        print("No está el Excel:", EXCEL)
        sys.exit(1)
    print("Excel:", EXCEL.name, "| commit" if COMMIT else "| dry-run")
    r = requests.get(
        f"{URL}/rest/v1/vehiculos",
        params={"select": "fecha_ultima_revision", "limit": "1"},
        headers=H,
        timeout=30,
    )
    tiene_rev = r.status_code == 200
    if not tiene_rev:
        print("AVISO: falta migración 0056 (fecha_ultima_revision). Cargo mant sin revisión.")
    vehs = get_vehs(tiene_rev)
    by = index_vehs(vehs)
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    mant = cargar_mantenimientos(wb, by, vehs)
    hoy = date(2026, 11, 24)
    revs = cargar_revisiones(wb, by, vehs, hoy) if tiene_rev else {}

    ok = [m for m in mant if m.get("ok")]
    fail = [m for m in mant if not m.get("ok")]
    print(f"Mantenimientos: {len(ok)} ok, {len(fail)} sin match")
    print(f"Con fecha ULT_MANTO: {sum(1 for m in ok if m.get('fecha_ultimo_mantenimiento'))}")
    print(f"Revisiones inferidas: {len(revs)}")

    if not COMMIT:
        print("Dry-run. Ejemplos:")
        for m in ok[:3]:
            print(" ", m)
        print("  rev sample", list(revs.items())[:3])
        print("Corré con --commit para escribir.")
        return

    n = 0
    for m in ok:
        body = {
            "fecha_ultimo_mantenimiento": m.get("fecha_ultimo_mantenimiento"),
            "km_ultimo_mantenimiento": m.get("km_ultimo_mantenimiento"),
            "km_actual": m.get("km_actual"),
        }
        if tiene_rev and m["id"] in revs:
            body["fecha_ultima_revision"] = revs[m["id"]]
        patch(m["id"], body, tiene_rev)
        n += 1
        if n % 50 == 0:
            print(f"  … {n}/{len(ok)}")

    # revisiones de carros que no estaban en MANTENIMIENTOS
    extra = 0
    ids_mant = {m["id"] for m in ok}
    for vid, fecha in revs.items():
        if vid in ids_mant:
            continue
        if not tiene_rev:
            break
        patch(vid, {"fecha_ultima_revision": fecha}, True)
        extra += 1

    print(f"Actualizados mant/km: {n}. Revisiones extra: {extra}.")


if __name__ == "__main__":
    main()
