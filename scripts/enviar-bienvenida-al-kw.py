#!/usr/bin/env python3
"""Manda la bienvenida aviso_numero_cartera a AutoLujo y Kowua.

No escribe a los carros que siguen sin cliente nuevo.
Si se corta, al volver a correr no repite los que ya salieron.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
LOG = Path(__file__).resolve().parent / ".bienvenida-al-kw-log.json"
EXCL = {
    "KOWUA": {"119", "120", "139", "151", "158", "163", "184", "187", "173"},
    "AUTOLUJO": {"51", "56", "94", "313", "323", "327", "329"},
}
TEMPLATE = "aviso_numero_cartera"

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
PHONE = env["WHATSAPP_PHONE_NUMBER_ID"]
TOKEN = env["WHATSAPP_TOKEN"]
GRAPH = f"https://graph.facebook.com/v21.0/{PHONE}/messages"


def sb_get(path: str):
    r = requests.get(f"{URL}/rest/v1/{path}", headers=H, timeout=90)
    r.raise_for_status()
    return r.json()


def digitos(n) -> str:
    t = re.sub(r"[^A-Z0-9]", "", str(n or "").upper())
    m = re.match(r"^([A-Z]*)0*(\d+)$", t)
    c = (m.group(1) + str(int(m.group(2)))) if m else t
    return re.sub(r"\D", "", c)


def tel(v) -> str | None:
    d = re.sub(r"\D", "", str(v or ""))
    if len(d) == 8:
        return "507" + d
    if d.startswith("507") and len(d) == 11:
        return d
    return None


def primer_nombre(nombre: str) -> str | None:
    partes = re.sub(r"\s+", " ", nombre or "").strip().split(" ")
    if not partes or not partes[0]:
        return None
    w = partes[0]
    if w.isupper() and len(w) > 1:
        w = w.capitalize()
    return w


def texto(nombre: str) -> str:
    return (
        f"Hola {nombre}, espero que esté bien. A partir de este momento debe "
        "enviarme a este número los comprobantes de pago y todo lo relacionado "
        "con cartera. Saludos, Claudia."
    )


def candidatos():
    emps = sb_get("empresas?codigo=in.(AUTOLUJO,KOWUA)&select=id,codigo")
    out = []
    for e in emps:
        vehs = sb_get(f"vehiculos?empresa_id=eq.{e['id']}&select=id,numero")
        by = {v["id"]: v for v in vehs}
        ids = list(by)
        cons = []
        for i in range(0, len(ids), 40):
            chunk = ",".join(ids[i : i + 40])
            cons.extend(sb_get(
                "contratos?estado=eq.activo"
                f"&vehiculo_id=in.({chunk})"
                "&select=id,cliente_id,vehiculo_id,cliente:clientes(nombre,whatsapp)"
            ))
        for c in cons:
            v = by[c["vehiculo_id"]]
            num = digitos(v["numero"])
            if num in EXCL[e["codigo"]]:
                continue
            cli = c.get("cliente") or {}
            wa = tel(cli.get("whatsapp"))
            nombre = primer_nombre(cli.get("nombre") or "")
            if not wa or not nombre:
                out.append({"skip": True, "emp": e["codigo"], "num": num, "motivo": "sin teléfono o sin nombre"})
                continue
            out.append({
                "skip": False,
                "emp": e["codigo"],
                "num": num,
                "wa": wa,
                "nombre": nombre,
                "cliente_id": c["cliente_id"],
                "contrato_id": c["id"],
                "vehiculo_id": v["id"],
            })
    return out


def ya_enviados() -> set[str]:
    if not LOG.exists():
        return set()
    data = json.loads(LOG.read_text())
    return {r["wa"] for r in data.get("ok", [])}


def guardar(ok, fail, saltados):
    LOG.write_text(json.dumps({
        "at": datetime.now(timezone.utc).isoformat(),
        "template": TEMPLATE,
        "ok": ok,
        "fail": fail,
        "saltados": saltados,
    }, ensure_ascii=False, indent=2))


def enviar(to: str, nombre: str) -> str:
    r = requests.post(
        GRAPH,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json={
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": TEMPLATE,
                "language": {"code": "es"},
                "components": [{
                    "type": "body",
                    "parameters": [{"type": "text", "text": nombre}],
                }],
            },
        },
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{r.status_code} {r.text[:300]}")
    msgs = r.json().get("messages") or []
    return msgs[0].get("id") if msgs else ""


def espejar(item: dict, message_id: str, cuerpo: str):
    wa = item["wa"]
    filas = sb_get(f"conversaciones?wa_numero=eq.{wa}&select=id,vehiculo_id,contrato_id")
    if filas:
        conv_id = filas[0]["id"]
        if not filas[0].get("vehiculo_id"):
            requests.patch(
                f"{URL}/rest/v1/conversaciones?id=eq.{conv_id}",
                headers=H,
                json={
                    "vehiculo_id": item["vehiculo_id"],
                    "contrato_id": item["contrato_id"],
                    "cliente_id": item["cliente_id"],
                    "etiqueta": f"{'AL' if item['emp'] == 'AUTOLUJO' else 'KW'} · Carro {item['num']}",
                },
                timeout=60,
            )
    else:
        sigla = "AL" if item["emp"] == "AUTOLUJO" else "KW"
        creada = requests.post(
            f"{URL}/rest/v1/conversaciones",
            headers=H,
            json={
                "wa_numero": wa,
                "cliente_id": item["cliente_id"],
                "vehiculo_id": item["vehiculo_id"],
                "contrato_id": item["contrato_id"],
                "etiqueta": f"{sigla} · Carro {item['num']}",
                "estado": "abierta",
            },
            timeout=60,
        )
        if creada.status_code >= 300:
            print("  chat no creado", item["num"], creada.text[:180])
            return
        conv_id = creada.json()[0]["id"]
    body = {
        "conversacion_id": conv_id,
        "direccion": "out",
        "tipo": "text",
        "texto": cuerpo,
        "wa_message_id": message_id or None,
        "enviado_por": "sistema",
    }
    ins = requests.post(f"{URL}/rest/v1/mensajes", headers=H, json=body, timeout=60)
    if ins.status_code >= 300 and "enviado_por" in ins.text:
        body.pop("enviado_por")
        ins = requests.post(f"{URL}/rest/v1/mensajes", headers=H, json=body, timeout=60)
    if ins.status_code >= 300:
        print("  mensaje no quedó en el chat", item["num"], ins.text[:180])
        return
    requests.patch(
        f"{URL}/rest/v1/conversaciones?id=eq.{conv_id}",
        headers=H,
        json={"ultimo_texto": cuerpo[:140], "ultimo_mensaje_at": datetime.now(timezone.utc).isoformat()},
        timeout=60,
    )


def main():
    rows = candidatos()
    saltados = [r for r in rows if r.get("skip")]
    envios = [r for r in rows if not r.get("skip")]
    vistos = set()
    unicos = []
    for r in envios:
        if r["wa"] in vistos:
            saltados.append({**r, "motivo": "teléfono repetido"})
            continue
        vistos.add(r["wa"])
        unicos.append(r)
    hechos = ya_enviados()
    pendientes = [r for r in unicos if r["wa"] not in hechos]
    print(f"a enviar {len(pendientes)}  ya estaban {len(hechos)}  saltados {len(saltados)}")
    if not 70 <= len(unicos) <= 220:
        raise SystemExit(f"la lista no cuadra: {len(unicos)}")
    ok = json.loads(LOG.read_text()).get("ok", []) if LOG.exists() else []
    fail = []
    for i, item in enumerate(pendientes, 1):
        cuerpo = texto(item["nombre"])
        try:
            mid = enviar(item["wa"], item["nombre"])
            espejar(item, mid, cuerpo)
            ok.append({"emp": item["emp"], "num": item["num"], "nombre": item["nombre"], "wa": item["wa"], "messageId": mid})
            print(f"{i}/{len(pendientes)} {item['emp']} {item['num']} {item['nombre']}")
        except Exception as e:
            fail.append({"emp": item["emp"], "num": item["num"], "nombre": item["nombre"], "wa": item["wa"], "error": str(e)[:300]})
            print(f"FALLO {item['emp']} {item['num']} {e}")
        if i % 15 == 0:
            guardar(ok, fail, [{"emp": s.get("emp"), "num": s.get("num"), "motivo": s.get("motivo")} for s in saltados])
        time.sleep(0.2)
    guardar(ok, fail, [{"emp": s.get("emp"), "num": s.get("num"), "motivo": s.get("motivo")} for s in saltados])
    print(f"listos {len(ok)} fallidos {len(fail)} saltados {len(saltados)}")


if __name__ == "__main__":
    main()
