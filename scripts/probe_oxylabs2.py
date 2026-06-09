#!/usr/bin/env python3
"""Focused probe: get ML public JSON API through Oxylabs without render."""
import base64, json, os, sys, urllib.parse, urllib.request

USER = os.environ.get("OXYLABS_USERNAME", "").strip()
PWD = os.environ.get("OXYLABS_PASSWORD", "").strip()
ENDPOINT = "https://realtime.oxylabs.io/v1/queries"
AUTH = "Basic " + base64.b64encode(f"{USER}:{PWD}".encode()).decode()
QUERY = sys.argv[1] if len(sys.argv) > 1 else "shampoo antiqueda"


def call(payload, label):
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": AUTH, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    print("=" * 70)
    print("TARGET", label, "| render =", payload.get("render", "(none)"))
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", "replace")
            status = r.status
    except Exception as e:
        print("ERR", repr(e)); return
    print("HTTP", status, "| bytes", len(raw))
    try:
        body = json.loads(raw)
    except Exception:
        print("outer non-json"); return
    results = body.get("results") or []
    if not results:
        print("no results[]"); return
    content = results[0].get("content")
    if isinstance(content, str):
        print("content str len", len(content))
        if content.strip():
            try:
                inner = json.loads(content)
                res = inner.get("results")
                print("PARSED JSON. results len:", len(res) if isinstance(res, list) else "n/a")
                if isinstance(res, list) and res:
                    s = res[0]
                    print("sample keys:", list(s.keys())[:30])
                    print("name:", s.get("title"))
                    print("price:", s.get("price"))
                    print("permalink:", str(s.get("permalink"))[:60])
                    seller = s.get("seller")
                    print("seller keys:", list(seller.keys())[:15] if isinstance(seller, dict) else seller)
            except Exception as e:
                print("inner non-json:", content[:200], repr(e))
    elif isinstance(content, dict):
        print("content dict keys:", list(content.keys())[:20])


url = f"https://api.mercadolibre.com/sites/MLB/search?q={urllib.parse.quote(QUERY)}&limit=30"
# Try without render at all
call({"source": "universal", "url": url, "geo_location": "Brazil", "parse": False}, "no_render")
# Try render=false explicitly
call({"source": "universal", "url": url, "geo_location": "Brazil", "parse": False, "render": False}, "render_false")
# Try without geo_location (API is global)
call({"source": "universal", "url": url, "parse": False}, "no_geo_no_render")
print("=" * 70, "\nDONE")
