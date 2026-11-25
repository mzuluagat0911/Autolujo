#!/usr/bin/env python3
"""
Limpia el ledger GOLD para que coincida con el Excel (último pago ≈ al día).

Borra renta/multas/siniestros/otras VIEJAS de contratos activos Gold.
Conserva cargos con tag 'migrado Gold hoja 2026-09-22' (domingos/mant. del Excel).
Pone saldo_inicial = 0.

Uso:
  python3 scripts/reset-gold-ledger.py           # dry-run
  python3 scripts/reset-gold-ledger.py --commit
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

COMMIT = "--commit" in sys.argv
TAG = "migrado Gold hoja 2026-09-22"

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
H_COUNT = {**H, "Prefer": "count=exact"}


def main():
    print("ESCRIBIENDO" if COMMIT else "DRY-RUN")
    gold = requests.get(
        f"{URL}/rest/v1/empresas?codigo=eq.GOLD&select=id", headers=H
    ).json()[0]["id"]
    cons = requests.get(
        f"{URL}/rest/v1/contratos?select=id,saldo_inicial,vehiculo:vehiculos!inner(numero)"
        f"&vehiculo.empresa_id=eq.{gold}&estado=eq.activo&order=vehiculo(numero)",
        headers=H,
    ).json()
    ids = [c["id"] for c in cons]
    print(f"contratos activos GOLD: {len(ids)}")

    # Cargos a borrar: todos los de estos contratos EXCEPTO tag Excel
    # PostgREST: borrar por contrato en lotes
    keep = 0
    delete_n = 0
    for c in cons:
        cid = c["id"]
        num = c["vehiculo"]["numero"]
        all_c = requests.get(
            f"{URL}/rest/v1/cargos?contrato_id=eq.{cid}&select=id,tipo,concepto,monto",
            headers=H,
        ).json()
        borrar = [
            g
            for g in all_c
            if TAG not in (g.get("concepto") or "")
        ]
        conservar = [g for g in all_c if TAG in (g.get("concepto") or "")]
        keep += len(conservar)
        delete_n += len(borrar)
        if borrar or float(c.get("saldo_inicial") or 0) != 0:
            print(
                f"  {num}: borrar {len(borrar)} cargos "
                f"(keep {len(conservar)}) saldo_ini {c.get('saldo_inicial')}→0"
            )
        if COMMIT and borrar:
            # delete in chunks of 50 ids
            chunk = [g["id"] for g in borrar]
            for i in range(0, len(chunk), 40):
                part = chunk[i : i + 40]
                r = requests.delete(
                    f"{URL}/rest/v1/cargos?id=in.({','.join(part)})",
                    headers={k: v for k, v in H.items() if k != "Prefer"},
                )
                if r.status_code >= 300:
                    print(f"    ERR delete {num} {r.status_code} {r.text[:200]}")
        if COMMIT and float(c.get("saldo_inicial") or 0) != 0:
            requests.patch(
                f"{URL}/rest/v1/contratos?id=eq.{cid}",
                headers=H,
                json={"saldo_inicial": 0},
            )

    # Pagos en contratos Gold activos (casi ninguno)
    pagos = requests.get(
        f"{URL}/rest/v1/pagos?contrato_id=in.({','.join(ids)})&select=id,contrato_id,monto,fecha",
        headers=H,
    ).json()
    print(f"\npagos en Gold activos: {len(pagos)}")
    for p in pagos:
        print(f"  pago {p['fecha']} ${p['monto']} contrato {p['contrato_id'][:8]}")
    if COMMIT and pagos:
        # No borramos pagos: con cargos limpios, un pago viejo dejaría saldo negativo
        # y el cliente aparecería "adelantado". Mejor anular efecto via nota — o borrar.
        # Con 1 pago raro, lo borramos para partida limpia.
        print("  → se borran para partida limpia (piloto Gold)")
        for i in range(0, len(pagos), 40):
            part = [p["id"] for p in pagos[i : i + 40]]
            requests.delete(
                f"{URL}/rest/v1/pagos?id=in.({','.join(part)})",
                headers={k: v for k, v in H.items() if k != "Prefer"},
            )

    print(f"\nResumen: borrar ~{delete_n} cargos, conservar {keep} (Excel), saldo_ini→0")
    if not COMMIT:
        print("👉 python3 scripts/reset-gold-ledger.py --commit")
    else:
        print("✅ Ledger Gold limpio.")


if __name__ == "__main__":
    main()
