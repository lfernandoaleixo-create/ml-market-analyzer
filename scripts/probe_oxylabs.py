#!/usr/bin/env python3
"""
Probe Oxylabs targets LIVE to decide the best source for ML public search.

Tries, in order:
  A) ML public JSON API: https://api.mercadolibre.com/sites/MLB/search?q=...
  B) ML internal polycard/search JSON
  C) ML HTML list page (current approach), parsed=true

For each, prints HTTP status, whether we got JSON, and how many items + a
sample of fields so we can pick the richest target. NO ML account creds are
sent — only the public keyword.
"""
import base64
import json
import os
import sys
import urllib.request

USER = os.environ.get("OXYLABS_USERNAME", "").strip()
PWD = os.environ.get("OXYLABS_PASSWORD", "").strip()
ENDPOINT = "https://realtime.oxylabs.io/v1/queries"

if not USER or not PWD:
    print("MISSING_CREDS")
    sys.exit(0)

AUTH = "Basic " + base64.b64encode(f"{USER}:{PWD}".encode()).decode()
QUERY = sys.argv[1] if len(sys.argv) > 1 else "shampoo antiqueda"


def call(payload, label):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={
            "Authorization": AUTH,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    print("=" * 70)
    print(f"TARGET {label}")
    print("payload.url =", payload.get("url"))
    print("payload.source =", payload.get("source"), "| render =", payload.get("render"), "| parse =", payload.get("parse"))
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            status = r.status
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        print("HTTP_ERROR", e.code)
        try:
            print(e.read().decode("utf-8", "replace")[:500])
        except Exception:
            pass
        return
    except Exception as e:
        print("NETWORK_ERROR", repr(e))
        return
    print("HTTP", status, "| bytes", len(raw))
    try:
        body = json.loads(raw)
    except Exception:
        print("NON_JSON (first 400 chars):", raw[:400])
        return
    results = body.get("results") or []
    print("results[]:", len(results))
    if results:
        content = results[0].get("content")
        ctype = type(content).__name__
        print("content type:", ctype)
        if isinstance(content, str):
            # It's the raw page/JSON-as-text. Try to parse JSON inside.
            print("content length:", len(content))
            inner = None
            try:
                inner = json.loads(content)
                print("content parsed as JSON. keys:", list(inner.keys())[:20])
                res = inner.get("results")
                if isinstance(res, list):
                    print("  inner.results len:", len(res))
                    if res:
                        sample = res[0]
                        keys = list(sample.keys())[:25] if isinstance(sample, dict) else type(sample).__name__
                        print("  sample keys:", keys)
            except Exception:
                print("content[:300]:", content[:300])
        elif isinstance(content, dict):
            print("content keys:", list(content.keys())[:25])
            for k in ("results", "organic", "products", "items"):
                v = content.get(k)
                if isinstance(v, list) and v:
                    print(f"  content.{k} len:", len(v))
                    s = v[0]
                    print("  sample keys:", list(s.keys())[:25] if isinstance(s, dict) else type(s).__name__)
                    break
                if isinstance(v, dict):
                    print(f"  content.{k} keys:", list(v.keys())[:20])


# A) Public JSON API of ML (no render, no parse — return as text and JSON-parse)
call(
    {
        "source": "universal",
        "url": f"https://api.mercadolibre.com/sites/MLB/search?q={urllib.parse.quote(QUERY)}&limit=30",
        "geo_location": "Brazil",
        "parse": False,
        "render": "html",
    },
    "A_public_json_api",
)

# B) Internal polycard/search JSON (frontend API)
call(
    {
        "source": "universal",
        "url": f"https://www.mercadolivre.com.br/jm/search?as_word={urllib.parse.quote(QUERY)}",
        "geo_location": "Brazil",
        "parse": False,
        "render": "html",
    },
    "B_internal_jm_search",
)

# C) HTML list page parsed (current approach) for comparison
slug = urllib.parse.quote(QUERY).replace("%20", "-")
call(
    {
        "source": "universal",
        "url": f"https://lista.mercadolivre.com.br/{slug}",
        "geo_location": "Brazil",
        "parse": True,
        "render": "html",
    },
    "C_html_parsed_current",
)
print("=" * 70)
print("DONE")
