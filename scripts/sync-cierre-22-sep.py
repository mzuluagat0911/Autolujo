#!/usr/bin/env python3
"""
Sincroniza cierre del 22-sep (Panamá) según operación:

  - G21: entregó el carro → contrato `devuelto`, sin deuda; carro libre.
  - G05/G24/G38/G42/G33: pagaron la letra del 22 → al día hasta 00:00 del 23.
  - Adelantados (G44 y similares): quita multa PAGO_TARDE fantasma del 22.

Uso:
  python3 scripts/sync-cierre-22-sep.py           # dry-run
  python3 scripts/sync-cierre-22-sep.py --commit  # escribe
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

COMMIT = "--commit" in sys.argv
FECHA = "2026-09-22"
PAGADO_AT = "2026-09-22T20:00:00-05:00"  # 3 p.m. Panamá → ISO con offset
# Better: use UTC equivalent of 15:00 Panama
PAGADO_AT_UTC = "2026-09-22T20:00:00+00:00"  # 15:00 Panama

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


def get(path: str):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=60)
    if r.status_code >= 300:
        print(f"  ERR GET {path[:100]} {r.status_code} {r.text[:300]}")
        return []
    return r.json()


def patch(table: str, filt: str, body: dict):
    print(f"  PATCH {table}?{filt} {body}")
    if not COMMIT:
        return []
    r = requests.patch(f"{URL}/rest/v1/{table}?{filt}", headers=H, json=body, timeout=60)
    if r.status_code >= 300:
        print(f"  ERR PATCH {r.status_code} {r.text[:300]}")
        return []
    return r.json()


def post(table: str, rows):
    print(f"  POST {table} {rows}")
    if not COMMIT:
        return []
    r = requests.post(f"{URL}/rest/v1/{table}", headers=H, json=rows, timeout=60)
    if r.status_code >= 300:
        print(f"  ERR POST {r.status_code} {r.text[:300]}")
        return []
    return r.json()


def delete(table: str, filt: str):
    print(f"  DELETE {table}?{filt}")
    if not COMMIT:
        return True
    r = requests.delete(
        f"{URL}/rest/v1/{table}?{filt}",
        headers={k: v for k, v in H.items() if k != "Prefer"},
        timeout=60,
    )
    if r.status_code >= 300:
        print(f"  ERR DELETE {r.status_code} {r.text[:300]}")
        return False
    return True


def gold_activo(num: str):
    n = re.sub(r"\D", "", num)
    vehs = get("vehiculos?select=id,numero,estado,empresa:empresas(codigo)")
    for v in vehs:
        if (v.get("empresa") or {}).get("codigo") != "GOLD":
            continue
        if re.sub(r"\D", "", str(v["numero"])) != n.lstrip("0") and re.sub(r"\D", "", str(v["numero"])) != n:
            # normalize both
            if re.sub(r"\D", "", str(v["numero"])).lstrip("0") != n.lstrip("0"):
                continue
        cs = get(f"contratos?vehiculo_id=eq.{v['id']}&estado=eq.activo&select=id,letra_diaria,cliente_id,cliente:clientes(nombre)")
        if cs:
            return v, cs[0]
    return None, None


def borrar_multa_22(cid: str, etiqueta: str):
    multas = get(
        f"cargos?contrato_id=eq.{cid}&fecha=eq.{FECHA}&concepto_codigo=eq.PAGO_TARDE&select=id,monto"
    )
    for m in multas:
        print(f"  [{etiqueta}] quita multa PAGO_TARDE ${m['monto']}")
        delete("cargos", f"id=eq.{m['id']}")


def asegurar_pago_letra(cid: str, letra: float, etiqueta: str, faltante: float):
    if faltante <= 0.009:
        return
    print(f"  [{etiqueta}] registra pago letra faltante ${faltante:.2f}")
    post(
        "pagos",
        [
            {
                "contrato_id": cid,
                "fecha": FECHA,
                "pagado_at": PAGADO_AT_UTC,
                "monto": round(faltante, 2),
                "estado_conciliacion": "manual",
                "origen": "oficina",
                "metodo": "efectivo",
                "referencia": f"cierre letra {FECHA} {etiqueta}",
            }
        ],
    )


def main():
    print("COMMIT" if COMMIT else "DRY-RUN")
    print(f"Fecha operativa: {FECHA} (hasta 23:59 Panamá)\n")

    # --- G21 entrega ---
    print("=== G21 entrega (ex-cliente sin deuda) ===")
    v21, c21 = gold_activo("21")
    if not c21:
        print("  (ya no hay contrato activo)")
    else:
        cid = c21["id"]
        print(f"  {c21.get('cliente', {}).get('nombre')} · veh {v21['numero']} · {v21['estado']}")
        borrar_multa_22(cid, "G21")
        # Cualquier saldo residual → ajuste a cero (relee tras borrar multa)
        sal = get(f"vw_saldo_contrato?contrato_id=eq.{cid}&select=saldo_actual")
        saldo = float(sal[0]["saldo_actual"]) if sal else 0.0
        # En dry-run la multa sigue: restala del cálculo.
        if not COMMIT:
            multas = get(
                f"cargos?contrato_id=eq.{cid}&fecha=eq.{FECHA}&concepto_codigo=eq.PAGO_TARDE&select=monto"
            )
            saldo -= sum(float(m["monto"]) for m in multas)
        if abs(saldo) > 0.009:
            print(f"  saldo residual {saldo} → ajuste a 0")
            if saldo > 0:
                post(
                    "pagos",
                    [
                        {
                            "contrato_id": cid,
                            "fecha": FECHA,
                            "pagado_at": PAGADO_AT_UTC,
                            "monto": round(saldo, 2),
                            "estado_conciliacion": "manual",
                            "origen": "oficina",
                            "metodo": "ajuste",
                            "referencia": "condonación entrega G21 sin deuda",
                        }
                    ],
                )
            else:
                post(
                    "cargos",
                    [
                        {
                            "contrato_id": cid,
                            "fecha": FECHA,
                            "tipo": "ajuste",
                            "concepto": "Ajuste entrega G21",
                            "monto": round(-saldo, 2),
                        }
                    ],
                )
        patch("contratos", f"id=eq.{cid}", {"estado": "devuelto"})
        print("  contrato → devuelto; carro queda sin contrato activo (pendiente asignación)")

    # --- Pagaron letra del 22 ---
    # G24 pagó $27 (cobro Excel) sobre letra $37 → faltan $10 + quitar multa
    # G38 sin pago registrado → $35
    # G05/G42 ya tienen pago = letra
    # G33 cumple libre (letra 0) — solo limpiar
    print("\n=== Letra del 22 cubierta ===")
    for num, extra in [
        ("05", 0.0),
        ("24", 10.0),
        ("33", 0.0),
        ("38", 35.0),
        ("42", 0.0),
    ]:
        v, c = gold_activo(num)
        if not c:
            print(f"  G{num}: sin activo")
            continue
        cid = c["id"]
        letra = float(c["letra_diaria"] or 0)
        print(f"  G{num} {(c.get('cliente') or {}).get('nombre')} letra={letra}")
        borrar_multa_22(cid, f"G{num}")
        if extra > 0.009:
            asegurar_pago_letra(cid, letra, f"G{num}", extra)

    # --- Adelantados: sin multa fantasma del 22 ---
    print("\n=== Adelantados: limpia multa 22 ===")
    for num in ("18", "23", "25", "27", "44"):
        v, c = gold_activo(num)
        if not c:
            continue
        print(f"  G{num}")
        borrar_multa_22(c["id"], f"G{num}")

    print("\nListo." + ("" if COMMIT else " (dry-run — corré con --commit)"))


if __name__ == "__main__":
    main()
