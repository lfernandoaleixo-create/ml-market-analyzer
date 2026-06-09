#!/usr/bin/env python3
"""Probe 5: Oxylabs render with browser_instructions (wait_for_element) to force
JS-rendered ML search results, like ScrapingBee does."""
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
    print("=" * 70); print("TARGET", label)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        print("HTTP_ERROR", e.code, e.read().decode("utf-8","replace")[:300]); return
    except Exception as e:
        print("ERR", repr(e)); return
    try:
        body = json.loads(raw)
    except Exception:
        print("outer non-json", raw[:200]); return
    results = body.get("results") or []
    if not results:
        print("no results"); return
    r0 = results[0]
    print("oxylabs status_code:", r0.get("status_code"))
    content = r0.get("content")
    if isinstance(content, str):
        print("html len:", len(content))
        for m in ["poly-card", "ui-search-result", "andes-money-amount__fraction", "ui-search-layout__item"]:
            print(f"  '{m}':", content.count(m))
    else:
        print("content type:", type(content).__name__)


slug = urllib.parse.quote(QUERY).replace("%20", "-")
url = f"https://lista.mercadolivre.com.br/{slug}"

# Oxylabs supports `browser_instructions` when render=html. Wait for results.
call({
    "source": "universal",
    "url": url,
    "geo_location": "Brazil",
    "parse": False,
    "render": "html",
    "browser_instructions": [
        {"type": "wait_for_element", "selector": {"type": "css", "value": "div.poly-card, li.ui-search-layout__item"}, "timeout_s": 15},
        {"type": "scroll", "x": 0, "y": 1200},
        {"type": "wait", "wait_time_s": 2},
    ],
}, "render_with_browser_instructions")

print("=" * 70, "\nDONE")
