#!/usr/bin/env python3
"""Sondagem: compara visitas reais (time_window 30d) por anúncio ATIVO
contra o que a aba mostraria. Usa o token salvo do owner."""
import json, urllib.request, sys

TOKEN = "APP_USR-1790005725650717-061806-1a997228b35510070c2b413dd4d21acf-3308178634"
SELLER = "3308178634"
API = "https://api.mercadolibre.com"

def get(path):
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

# 1) ids ativos
ids = []
offset = 0
while True:
    d = get(f"/users/{SELLER}/items/search?status=active&limit=50&offset={offset}")
    res = d.get("results", [])
    ids.extend(res)
    total = d.get("paging", {}).get("total", 0)
    offset += 50
    if offset >= total or not res:
        break
print(f"ativos: {len(ids)} (total reportado: {total})")

# 2) visitas por item
sample_shape = None
total_visits = 0
per = []
for i, iid in enumerate(ids):
    try:
        v = get(f"/items/{iid}/visits/time_window?last=30&unit=day")
    except Exception as e:
        per.append((iid, None))
        continue
    if sample_shape is None:
        sample_shape = list(v.keys())
    tv = v.get("total_visits")
    if isinstance(tv, int):
        total_visits += tv
    per.append((iid, tv))

print("shape time_window keys:", sample_shape)
print("soma total_visits (30d, ativos):", total_visits)
nz = [(i, t) for i, t in per if isinstance(t, int) and t > 0]
print("itens com visitas > 0:", len(nz))
print("top 8:", sorted(nz, key=lambda x: -x[1])[:8])
