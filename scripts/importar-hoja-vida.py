#!/usr/bin/env python3
"""
Importa la bitácora del Excel de Hoja de vida → vehiculo_eventos.

Requiere migración 0026 aplicada.

Uso:
  python3 scripts/importar-hoja-vida.py            # dry-run
  python3 scripts/importar-hoja-vida.py --commit   # escribe
"""
from __future__ import annotations

import re
import sys
import warnings
from datetime import datetime, date
from pathlib import Path

import openpyxl
import requests

warnings.filterwarnings("ignore")

COMMIT = "--commit" in sys.argv
ROOT = Path(__file__).resolve().parents[1]
CANDIDATOS = [
    Path.home() / "Downloads" / "Hoja de vida carros Autolujo Actualizadas 2025 (1).xlsx",
    Path.home() / "Downloads" / "Hoja de vida carros Autolujo Actualizadas 2025.xlsx",
    ROOT / "Hoja de vida carros Autolujo Actualizadas 2025.xlsx",
]
HOJA = next((p for p in CANDIDATOS if p.exists()), CANDIDATOS[0])
SKIP_SHEET = re.compile(r"VENDID|PERDIDA|MOTO|TRASPASO", re.I)

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
    "Prefer": "return=minimal",
}


def canon_num(s: str) -> str:
    t = re.sub(r"[^A-Z0-9]", "", str(s).upper())
    m = re.match(r"^([A-Z]*)0*(\d+)$", t)
    if m:
        pref, n = m.group(1), str(int(m.group(2)))
        return pref + n if pref else n
    return t


def clasificar(texto: str) -> str:
    u = texto.upper()
    if re.search(r"MANTENIMIENTO|FULL\b|ACEITE\s*10|PR[ÓO]XIMO MANTEN", u):
        return "mantenimiento"
    if re.search(r"CHAPISTER|COLISI[OÓ]N|CHOQUE", u) and "SIN NOVEDAD" not in u:
        return "chapisteria"
    if re.search(r"CONTRATO\s+Y\s+ENTREGA|ENTREGA\s+CARRO|CONSECUTIVO", u):
        return "contrato"
    if re.search(r"DEVOLUCI[OÓ]N|SE RETIRA|RETIRA VEH|CUSTODIA", u):
        return "devolucion"
    if re.search(r"REVISI[OÓ]N|REVISION", u):
        return "revision"
    if re.search(r"PLACA|LICENCIA|REVISADO|SEGURO|PANAPASS|\bGPS\b", u):
        return "documento"
    if "NOVEDAD" in u:
        return "novedad"
    return "otro"


def to_date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def titulo_corto(detalle: str) -> str | None:
    line = detalle.strip().split("\n")[0].strip()
    line = re.sub(r"\s+", " ", line)
    if len(line) > 80:
        line = line[:77] + "…"
    return line or None


def main() -> None:
    if not HOJA.exists():
        raise SystemExit(f"No encuentro Excel: {HOJA}")
    print(f"Excel: {HOJA}")

    veh = requests.get(
        f"{URL}/rest/v1/vehiculos?select=id,numero,empresa:empresas(codigo)&estado=neq.entregado&limit=1000",
        headers=H,
        timeout=60,
    ).json()
    by_num: dict[str, list] = {}
    for v in veh:
        ck = canon_num(v["numero"])
        by_num.setdefault(ck, []).append(v)
    print(f"Vehículos DB: {len(veh)}")

    wb = openpyxl.load_workbook(HOJA, data_only=True, read_only=True)
    rows_out: list[dict] = []
    sin_match = 0
    hojas = 0

    for name in wb.sheetnames:
        if SKIP_SHEET.search(name):
            continue
        m = re.search(r"CARRO\s+([A-Z]?-?\d+)", name.upper())
        if not m:
            continue
        key = canon_num(m.group(1))
        hits = by_num.get(key) or by_num.get("G" + key) or []
        if key.startswith("G"):
            hits = [h for h in hits if (h.get("empresa") or {}).get("codigo") == "GOLD"] or hits
        elif len(hits) > 1:
            hits = [h for h in hits if (h.get("empresa") or {}).get("codigo") == "AUTOLUJO"] or hits
        if not hits:
            sin_match += 1
            continue
        vid = hits[0]["id"]
        hojas += 1
        ws = wb[name]
        for i, row in enumerate(ws.iter_rows(min_row=3, max_col=8, values_only=True), 3):
            fecha = to_date(row[0] if row else None)
            km = None
            if row and len(row) > 2 and row[2] is not None:
                try:
                    kv = float(row[2])
                    if 50 < kv < 800_000:
                        km = int(kv)
                except Exception:
                    pass
            # descripción: col D (idx 3) o B si es contrato largo
            partes = []
            for idx in (3, 1, 4):
                if row and len(row) > idx and row[idx] is not None:
                    s = str(row[idx]).strip()
                    if s and s.upper() not in ("FECHA", "DATOS BASICOS CONDUCTOR"):
                        partes.append(s)
            if not partes:
                continue
            detalle = "\n".join(partes)
            if len(detalle) < 3:
                continue
            # Sin fecha: saltar (evita basura)
            if not fecha:
                continue
            valor = None
            if row and len(row) > 5 and row[5] is not None:
                try:
                    valor = float(row[5])
                except Exception:
                    pass
            lugar = str(row[4]).strip() if row and len(row) > 4 and row[4] else None
            if lugar and len(lugar) > 80:
                lugar = lugar[:77] + "…"
            tipo = clasificar(detalle)
            rows_out.append(
                {
                    "vehiculo_id": vid,
                    "fecha": fecha,
                    "km": km,
                    "tipo": tipo,
                    "titulo": titulo_corto(detalle),
                    "detalle": detalle[:4000],
                    "lugar": lugar,
                    "valor": valor,
                    "origen": "hv_excel",
                }
            )

    print(f"Hojas matcheadas: {hojas} | sin match: {sin_match}")
    print(f"Eventos a cargar: {len(rows_out)}")
    from collections import Counter
    print("  tipos", dict(Counter(r["tipo"] for r in rows_out)))

    if not COMMIT:
        print("\nDRY-RUN. Si cuadra: python3 scripts/importar-hoja-vida.py --commit")
        return

    # Borrar previos importados del excel para re-import limpio
    r = requests.delete(
        f"{URL}/rest/v1/vehiculo_eventos?origen=eq.hv_excel",
        headers=H,
        timeout=120,
    )
    print(f"Limpieza hv_excel: {r.status_code}")

    ok = 0
    batch = 100
    for i in range(0, len(rows_out), batch):
        chunk = rows_out[i : i + batch]
        rr = requests.post(
            f"{URL}/rest/v1/vehiculo_eventos",
            headers=H,
            json=chunk,
            timeout=120,
        )
        if rr.status_code >= 300:
            print("ERR", rr.status_code, rr.text[:300])
            break
        ok += len(chunk)
        print(f"  {ok}/{len(rows_out)}")
    print(f"Escritos: {ok}")


if __name__ == "__main__":
    main()
