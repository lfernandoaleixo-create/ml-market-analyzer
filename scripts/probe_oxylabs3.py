#!/usr/bin/env python3
"""Probe 3: inspect Oxylabs response meta + try render=html on the JSON API,
and try the public API on www host. Print status_code reported by Oxylabs."""
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
    print("TARGET", label)
    print("url:", payload.get("url"))
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", "replace")
    except Exception as e:
        print("ERR", repr(e)); return
    try:
        body = json.loads(raw)
    except Exception:
        print("outer non-json"); return
    results = body.get("results") or []
    if not results:
        print("no results"); return
    r0 = results[0]
    # Oxylabs includes meta like status_code, url, created_at
    print("oxylabs meta status_code:", r0.get("status_code"))
    print("oxylabs meta url:", str(r0.get("url"))[:80])
    content = r0.get("content")
    if isinstance(content, str):
        print("content str len:", len(content))
        body_preview = content.strip()[:300]
        print("preview:", body_preview)
        if content.strip():
            try:
                inner = json.loads(content)
                res = inner.get("results")
                print("PARSED results len:", len(res) if isinstance(res, list) else "n/a", "| paging:", inner.get("paging"))
                if isinstance(res, list) and res:
                    s = res[0]
                    print("sample title:", s.get("title"), "| price:", s.get("price"))
            except Exception:
                print("not json content")
    elif isinstance(content, dict):
        print("content dict keys:", list(content.keys())[:20])


q = urllib.parse.quote(QUERY)
# render=html on the public JSON API (forces a real browser render of the JSON body)
call({"source": "universal", "url": f"https://api.mercadolibre.com/sites/MLB/search?q={q}&limit=30", "parse": False, "render": "html"}, "api_render_html")
# The 'official' style host sometimes differs; try mercadolibre.com (no .br) site
call({"source": "universal", "url": f"https://api.mercadolibre.com/sites/MLB/search?q={q}#json", "parse": False, "render": "html"}, "api_anchor")
print("=" * 70, "\nDONE")
