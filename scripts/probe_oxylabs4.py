#!/usr/bin/env python3
"""Probe 4: render the ML search list page via Oxylabs and check for poly-cards
(the same DOM ScrapingBee parses). If present, we can reuse the Cheerio parser."""
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
    print("=" * 70); print("TARGET", label, "| url:", payload.get("url"))
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
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
    print("oxylabs status_code:", r0.get("status_code"))
    content = r0.get("content")
    if isinstance(content, str):
        html = content
        print("html len:", len(html))
        for marker in ["poly-card", "ui-search-result", "andes-money-amount__fraction", "ui-search-layout__item"]:
            print(f"  contains '{marker}':", html.count(marker))
    elif isinstance(content, dict):
        print("content dict keys:", list(content.keys())[:20])


slug = urllib.parse.quote(QUERY).replace("%20", "-")
call({"source": "universal", "url": f"https://lista.mercadolivre.com.br/{slug}", "geo_location": "Brazil", "parse": False, "render": "html"}, "list_render_html")
print("=" * 70, "\nDONE")
