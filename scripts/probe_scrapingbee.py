#!/usr/bin/env python3
"""Probe ScrapingBee reliability: how many poly-cards come back for different
wait strategies. Helps us pick a setting that doesn't intermittently return 0.
Only a public ML keyword + the dedicated API key are sent."""
import os, sys, time, urllib.parse, urllib.request

KEY = os.environ.get("SCRAPINGBEE_API_KEY", "").strip()
ENDPOINT = "https://app.scrapingbee.com/api/v1"
QUERY = sys.argv[1] if len(sys.argv) > 1 else "shampoo antiqueda"
slug = urllib.parse.quote(QUERY).replace("%20", "-")
ML_URL = f"https://lista.mercadolivre.com.br/{slug}"


def run(params, label):
    qs = {"api_key": KEY, "url": ML_URL, "render_js": "true", "premium_proxy": "true", "country_code": "br"}
    qs.update(params)
    url = ENDPOINT + "?" + urllib.parse.urlencode(qs)
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            html = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        print(f"{label}: HTTP_ERROR {e.code} ({time.time()-t0:.1f}s)")
        return
    except Exception as e:
        print(f"{label}: ERR {e!r} ({time.time()-t0:.1f}s)")
        return
    cards = html.count("poly-card")
    print(f"{label}: HTTP {status} | {len(html)} bytes | poly-card={cards} | {time.time()-t0:.1f}s")


# Current setting
run({"block_resources": "true", "wait": "1500"}, "A current(block+wait1500)")
# Longer wait, still blocking resources
run({"block_resources": "true", "wait": "5000"}, "B block+wait5000")
# wait_for selector (no fixed wait) — block resources
run({"block_resources": "true", "wait_for": "div.poly-card"}, "C block+wait_for")
# wait_for selector WITHOUT blocking resources (sometimes grid needs assets)
run({"wait_for": "div.poly-card"}, "D nowaitblock+wait_for")
print("DONE")
