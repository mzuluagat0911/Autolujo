#!/usr/bin/env python3
"""
Completa placa / marca / modelo / año / revisado_vence desde el listado de placas (Excel).

- Solo rellena campos vacíos de ficha (no pisa placa distinta).
- `VENCE PLACA` (mes) → revisado_vence = día 30 del **próximo** vencimiento
  (si el mes ya pasó este año → año siguiente).
- Crea vehículos que están en el Excel y faltan en la DB, si se puede
  inferir la empresa (huecos numéricos AL/KW o prefijo G* = GOLD).

Uso:
  python3 scripts/completar-placas-listado.py            # dry-run
  python3 scripts/completar-placas-listado.py --commit   # escribe en Supabase
"""
from __future__ import annotations

import calendar
import re
import sys
import time
import warnings
from collections import defaultdict
from datetime import date
from pathlib import Path

import openpyxl
import requests

warnings.filterwarnings("ignore")

COMMIT = "--commit" in sys.argv
ROOT = Path(__file__).resolve().parents[1]
# “Hoy” Panamá (UTC-5): usamos fecha local del sistema.
HOY_REF = date.today()
MESES = {
    "ENERO": 1,
    "FEBRERO": 2,
    "MARZO": 3,
    "ABRIL": 4,
    "MAYO": 5,
    "JUNIO": 6,
    "JULIO": 7,
    "AGOSTO": 8,
    "SEPTIEMBRE": 9,
    "SETIEMBRE": 9,
    "OCTUBRE": 10,
    "NOVIEMBRE": 11,
    "DICIEMBRE": 12,
}
CANDIDATOS = [
    Path.home()
    / "Downloads"
    / "LISTADO DE PLACAS CARROS ACTUALIZADO A 19 SEPTIEMBRE 2026 copia.xlsx",
    Path.home()
    / "Downloads"
    / "LISTADO DE PLACAS CARROS ACTUALIZADO A 19 SEPTIEMBRE 2026.xlsx",
]
HOJA = next((p for p in CANDIDATOS if p.exists()), CANDIDATOS[0])

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


def sb_patch(table: str, id_: str, patch: dict) -> bool:
    last_err = None
    for intento in range(5):
        try:
            r = requests.patch(
                f"{URL}/rest/v1/{table}?id=eq.{id_}",
                headers=H,
                json=patch,
                timeout=60,
            )
            if r.status_code >= 300:
                print("  ERR patch", id_, r.status_code, r.text[:200])
                return False
            return True
        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
            last_err = e
            time.sleep(1.5 * (intento + 1))
    print("  ERR patch", id_, last_err)
    return False


def sb_post(table: str, row: dict) -> bool:
    last_err = None
    for intento in range(5):
        try:
            r = requests.post(
                f"{URL}/rest/v1/{table}",
                headers=H,
                json=row,
                timeout=60,
            )
            if r.status_code >= 300:
                print("  ERR insert", row.get("numero"), r.status_code, r.text[:240])
                return False
            return True
        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
            last_err = e
            time.sleep(1.5 * (intento + 1))
    print("  ERR insert", row.get("numero"), last_err)
    return False


def canon_num(s: str) -> str:
    t = re.sub(r"[^A-Z0-9]", "", str(s).upper())
    m = re.match(r"^([A-Z]*)0*(\d+)$", t)
    if m:
        pref, n = m.group(1), str(int(m.group(2)))
        return pref + n if pref else n
    return t


def placa_ok(raw: str | None) -> str | None:
    if not raw:
        return None
    p = re.sub(r"[^A-Z0-9]", "", str(raw).upper())
    if not re.fullmatch(r"[A-Z]{1,3}\d{3,4}", p):
        return None
    if len(p) < 5:
        return None
    return p


def parse_modelo(raw: str | None) -> tuple[str | None, str | None]:
    if not raw:
        return None, None
    u = re.sub(r"\s+", " ", str(raw).upper()).strip()
    if not u or u in {"KIA", "HYUNDAI"}:
        if "KIA" in u:
            return "Kia", None
        if "HYUNDAI" in u:
            return "Hyundai", None
        return None, None
    marca = modelo = None
    if "SOLUTO" in u:
        marca, modelo = "Kia", "Soluto"
        if "SEDAN" in u:
            modelo = "Soluto Sedán"
        if "AUTOM" in u:
            modelo = f"{modelo} Automático"
        elif "MANUAL" in u:
            modelo = f"{modelo} Manual"
    elif re.search(r"GRAND\s*I[\s\-]?10|GRANDI10|I[\s\-]?10", u) or "HYUNDAI" in u:
        marca, modelo = "Hyundai", "Grand i10"
        if "AUTOM" in u:
            modelo = "Grand i10 Automático"
        elif "MANUAL" in u:
            modelo = "Grand i10 Manual"
    elif "KIA" in u:
        marca = "Kia"
    return marca, modelo


def anio_ok(raw) -> int | None:
    if raw is None:
        return None
    try:
        n = int(float(raw))
    except (TypeError, ValueError):
        return None
    if 2010 <= n <= 2035:
        return n
    return None


def format_numero_display(raw) -> str:
    """Conserva estilo G08 si venía así; números puros sin ceros a la izquierda."""
    s = str(raw).strip().upper()
    if re.fullmatch(r"G\d+", s):
        n = int(s[1:])
        return f"G{n:02d}" if n < 100 else f"G{n}"
    if re.fullmatch(r"\d+", s):
        return str(int(s))
    return s


def mes_a_revisado(raw) -> str | None:
    """VENCE PLACA (solo mes) → próximo día 30 de ese mes (anual).

    Si el 30 de ese mes en el año actual ya pasó (o es hoy), usa el año siguiente.
    Así ene–ago no aparecen todos vencidos en sept.
    """
    if raw is None:
        return None
    u = re.sub(r"[^A-ZÁÉÍÓÚÑ]", "", str(raw).upper())
    u = (
        u.replace("Á", "A")
        .replace("É", "E")
        .replace("Í", "I")
        .replace("Ó", "O")
        .replace("Ú", "U")
    )
    m = MESES.get(u)
    if not m:
        return None
    y = HOY_REF.year
    d = min(30, calendar.monthrange(y, m)[1])
    cand = date(y, m, d)
    if cand <= HOY_REF:
        y += 1
        d = min(30, calendar.monthrange(y, m)[1])
        cand = date(y, m, d)
    return cand.isoformat()


def load_excel(path: Path) -> dict[str, dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    out: dict[str, dict] = {}
    skipped = 0
    for row in ws.iter_rows(min_row=3, values_only=True):
        carro, placa, anio, _tipo, modelo, vence = (
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
            row[11],
        )
        if carro is None:
            continue
        key = canon_num(carro)
        if not key or key == "KIA":
            skipped += 1
            continue
        p = placa_ok(placa)
        if not p:
            skipped += 1
            continue
        marca, modelo_n = parse_modelo(str(modelo) if modelo else None)
        out[key] = {
            "placa": p,
            "anio": anio_ok(anio),
            "marca": marca,
            "modelo": modelo_n,
            "revisado_vence": mes_a_revisado(vence),
            "raw": carro,
            "numero": format_numero_display(carro),
        }
    print(f"Excel: {len(out)} filas útiles (saltadas {skipped})")
    return out


def load_vehiculos() -> list[dict]:
    allv: list[dict] = []
    frm = 0
    while True:
        batch = sb_get(
            "vehiculos?select=id,numero,placa,marca,modelo,anio,revisado_vence,estado,"
            f"empresa:empresas(codigo)&order=numero&offset={frm}&limit=1000"
        )
        allv.extend(batch)
        if len(batch) < 1000:
            break
        frm += 1000
    return allv


def infer_empresa(
    key: str,
    nums_por_emp: dict[str, set[int]],
    emp_ids: dict[str, str],
) -> str | None:
    """Devuelve codigo de empresa o None si no se puede inferir con seguridad."""
    if key.startswith("G") and key[1:].isdigit():
        return "GOLD" if "GOLD" in emp_ids else None
    if not key.isdigit():
        return None
    n = int(key)
    for codigo, nums in nums_por_emp.items():
        if codigo == "GOLD":
            continue
        lo, hi = min(nums), max(nums)
        if lo - 5 <= n <= hi + 5 and any(abs(x - n) <= 8 for x in nums):
            return codigo
    return None


def main() -> None:
    if not HOJA.exists():
        print("No encontré el Excel:", HOJA)
        sys.exit(1)
    print("Fuente:", HOJA.name)
    print("Modo:", "COMMIT" if COMMIT else "dry-run")

    excel = load_excel(HOJA)
    vehs = load_vehiculos()
    print(f"Supabase: {len(vehs)} vehículos")

    empresas = {e["codigo"]: e["id"] for e in sb_get("empresas?select=id,codigo")}
    nums_por_emp: dict[str, set[int]] = defaultdict(set)
    by_num: dict[str, list[dict]] = {}
    for v in vehs:
        by_num.setdefault(canon_num(v["numero"]), []).append(v)
        emp = (v.get("empresa") or {}).get("codigo")
        if emp and re.fullmatch(r"\d+", str(v["numero"])):
            nums_por_emp[emp].add(int(v["numero"]))

    fills = 0
    ok = 0
    conflicts = 0
    orphans: list[tuple[str, dict]] = []
    patches: list[tuple[dict, dict, dict]] = []
    inserts: list[dict] = []

    for k, ex in sorted(excel.items(), key=lambda x: x[0]):
        vs = by_num.get(k, [])
        if not vs:
            orphans.append((k, ex))
            continue
        for v in vs:
            cur = placa_ok(v.get("placa"))
            patch: dict = {}
            if not cur:
                patch["placa"] = ex["placa"]
            elif cur != ex["placa"]:
                conflicts += 1
                emp = (v.get("empresa") or {}).get("codigo")
                print(
                    f"  CONFLICTO {v['numero']} ({emp}): DB={cur} Excel={ex['placa']}"
                )
            else:
                ok += 1

            if not (v.get("marca") or "").strip() and ex.get("marca"):
                patch["marca"] = ex["marca"]
            if not (v.get("modelo") or "").strip() and ex.get("modelo"):
                patch["modelo"] = ex["modelo"]
            if v.get("anio") is None and ex.get("anio"):
                patch["anio"] = ex["anio"]
            # Revisado: rellenar vacío o alinear al mes del listado (año del Excel).
            if ex.get("revisado_vence") and v.get("revisado_vence") != ex["revisado_vence"]:
                patch["revisado_vence"] = ex["revisado_vence"]

            if patch:
                patches.append((v, ex, patch))
                if "placa" in patch:
                    fills += 1

    revisados = sum(1 for _v, _e, p in patches if "revisado_vence" in p)
    print(f"Revisado a cargar/actualizar: {revisados}")

    for k, ex in orphans:
        codigo = infer_empresa(k, nums_por_emp, empresas)
        if not codigo:
            print(f"  HUÉRFANO sin empresa clara: {ex['numero']} → {ex['placa']}")
            continue
        inserts.append(
            {
                "empresa_id": empresas[codigo],
                "numero": ex["numero"],
                "placa": ex["placa"],
                "marca": ex.get("marca"),
                "modelo": ex.get("modelo"),
                "anio": ex.get("anio"),
                "revisado_vence": ex.get("revisado_vence"),
                "estado": "activo",
            }
        )

    print(f"\nPlacas ya OK: {ok}")
    print(f"Placas a completar: {fills}")
    print(f"Conflictos (no se pisan): {conflicts}")
    print(f"En Excel sin vehículo en DB: {len(orphans)}")
    print(f"Altas a crear (empresa inferida): {len(inserts)}")
    for row in inserts:
        emp = next(c for c, i in empresas.items() if i == row["empresa_id"])
        print(
            f"  + {row['numero']} ({emp}) {row['placa']} "
            f"{row.get('marca')} {row.get('modelo')} {row.get('anio')}"
        )

    sin_db = [
        v
        for v in vehs
        if not placa_ok(v.get("placa"))
        and canon_num(v["numero"]) not in excel
        and str(v["numero"]) != "9999"
    ]
    print(f"Sin placa en DB y no en Excel (excl. 9999 prueba): {len(sin_db)}")

    print(f"\nPatches (ficha/placa): {len(patches)}")
    for v, ex, patch in patches[:25]:
        emp = (v.get("empresa") or {}).get("codigo")
        print(f"  {v['numero']} ({emp}): {patch}")
    if len(patches) > 25:
        print(f"  … +{len(patches) - 25}")

    if not COMMIT:
        print("\nDry-run. Pasá --commit para escribir.")
        return

    written = 0
    for v, _ex, patch in patches:
        if sb_patch("vehiculos", v["id"], patch):
            written += 1
        else:
            print("  falló patch", v["numero"], patch)
    created = 0
    for row in inserts:
        if sb_post("vehiculos", row):
            created += 1
        else:
            print("  falló insert", row["numero"])
    print(f"\nPatches escritos: {written}/{len(patches)}")
    print(f"Altas creadas: {created}/{len(inserts)}")


if __name__ == "__main__":
    main()
