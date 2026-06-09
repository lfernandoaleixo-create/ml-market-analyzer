"""
Probe the REAL Mercado Livre search HTML (via ScrapingBee) and inspect which
extra fields the poly-cards actually expose, so we only parse what exists:
  - "vendidos" (units sold)
  - listing type / Full badge (fulfillment)
  - seller reputation / official store
We dump raw snippets of the first few cards to drive the parser update.
"""
import os
import sys
import re
import requests
from bs4 import BeautifulSoup

KEY = os.environ.get("SCRAPINGBEE_API_KEY")
if not KEY:
    print("NO_KEY")
    sys.exit(1)

QUERY = "creatina"
slug = QUERY.strip().replace(" ", "-")
target = f"https://lista.mercadolivre.com.br/{slug}"

params = {
    "api_key": KEY,
    "url": target,
    "render_js": "true",
    "premium_proxy": "true",
    "country_code": "br",
    "block_resources": "true",
    "wait": "1500",
}
print(f"Fetching {target} ...")
r = requests.get("https://app.scrapingbee.com/api/v1/", params=params, timeout=120)
print("HTTP", r.status_code, "bytes", len(r.text))
if r.status_code != 200:
    print(r.text[:500])
    sys.exit(1)

html = r.text
with open("/home/ubuntu/ml-market-analyzer/scripts/ml_sample.html", "w") as f:
    f.write(html)

soup = BeautifulSoup(html, "html.parser")
cards = soup.select("div.poly-card")
print("poly-cards:", len(cards))

# Inspect distinctive class names present across cards (frequency).
from collections import Counter
cls = Counter()
for c in cards[:20]:
    for el in c.find_all(True):
        for k in (el.get("class") or []):
            cls[k] += 1

print("\n=== Most common classes in first 20 cards (poly-* and andes-*) ===")
for name, n in cls.most_common():
    if name.startswith("poly") or "sold" in name.lower() or "full" in name.lower() or "highlight" in name.lower():
        print(f"  {n:4d}  {name}")

# Look for "vendidos" text anywhere in the cards.
print("\n=== 'vendidos' occurrences (first 8) ===")
found = 0
for c in cards:
    t = c.get_text(" ", strip=True)
    m = re.search(r"([\d\.\+mil]+)\s+vendid[oa]s", t, re.IGNORECASE)
    if m:
        print("  ", m.group(0))
        found += 1
        if found >= 8:
            break
print("  total cards with 'vendidos':", sum(1 for c in cards if re.search(r"vendid", c.get_text(" ", strip=True), re.I)))

# Look for FULL / fulfillment badges.
print("\n=== FULL / fulfillment hints ===")
full = 0
for c in cards:
    html_c = str(c).lower()
    if "full" in html_c or "fulfillment" in html_c:
        full += 1
print("  cards mentioning 'full':", full)

# Dump the full HTML of the FIRST card for manual selector discovery.
print("\n=== FIRST CARD HTML (truncated 4000 chars) ===")
if cards:
    print(str(cards[0])[:4000])
