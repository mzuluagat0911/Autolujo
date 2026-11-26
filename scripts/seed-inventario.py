#!/usr/bin/env python3
"""Carga el catálogo de inventario (stock 0 en ambas sedes). Requiere migración 0061."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CATALOGO = ROOT / "scripts" / "data" / "inventario-catalogo.json"
SEDES = ("juan_diaz", "chorrera")


def load_env():
  env = ROOT / ".env.local"
  if not env.exists():
    return
  for line in env.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
  load_env()
  url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
  key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
  if not url or not key:
    print("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
    return 1
  if not CATALOGO.exists():
    print(f"No está {CATALOGO}", file=sys.stderr)
    return 1

  items = json.loads(CATALOGO.read_text(encoding="utf-8"))
  H = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
  }

  # ¿tablas listas?
  probe = requests.get(
    f"{url}/rest/v1/inventario_items",
    params={"select": "id", "limit": "1"},
    headers=H,
    timeout=60,
  )
  if probe.status_code >= 400:
    print("Migración 0061 no aplicada:", probe.text[:300], file=sys.stderr)
    return 1

  upserted = 0
  for i in range(0, len(items), 100):
    batch = items[i : i + 100]
    body = [
      {
        "rubro": it["rubro"],
        "codigo": it["codigo"],
        "descripcion": it["descripcion"],
        "precio_unitario": it.get("precio_unitario"),
        "proveedor": it.get("proveedor"),
        "activo": True,
      }
      for it in batch
    ]
    r = requests.post(
      f"{url}/rest/v1/inventario_items",
      params={"on_conflict": "rubro,codigo"},
      headers=H,
      json=body,
      timeout=120,
    )
    if r.status_code >= 400:
      print("items error", r.status_code, r.text[:400], file=sys.stderr)
      return 1
    rows = r.json()
    upserted += len(rows)

    stock_body = []
    for row in rows:
      for sede in SEDES:
        stock_body.append(
          {
            "item_id": row["id"],
            "sede": sede,
            "cantidad": 0,
          }
        )
    rs = requests.post(
      f"{url}/rest/v1/inventario_stock",
      params={"on_conflict": "item_id,sede"},
      headers={
        **H,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      json=stock_body,
      timeout=120,
    )
    if rs.status_code >= 400:
      print("stock error", rs.status_code, rs.text[:400], file=sys.stderr)
      return 1

  print(f"OK: {upserted} ítems · stock 0 en Juan Díaz y La Chorrera")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
