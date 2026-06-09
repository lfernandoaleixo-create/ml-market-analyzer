"""Inspect the saved ML sample HTML for extractable enrichment fields."""
import re
from bs4 import BeautifulSoup

with open("/home/ubuntu/ml-market-analyzer/scripts/ml_sample.html") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
cards = soup.select("div.poly-card")
print("cards:", len(cards))

# 1) Official store marker (aria-label="Loja oficial")
official = sum(1 for c in cards if c.select_one('[aria-label="Loja oficial"]'))
print("\n[official store] cards with 'Loja oficial' icon:", official)

# 2) FULL shipping badge — look for the actual visible badge, not CSS noise.
#    ML uses a fulfillment icon/label in the shipping area.
full_svg = sum(1 for c in cards if c.select_one('[aria-label*="Full" i]'))
full_text = sum(1 for c in cards if re.search(r"\bfull\b", c.get_text(" ", strip=True), re.I))
print("[full] cards with aria-label*=Full:", full_svg, "| visible text 'full':", full_text)
# Dump a shipping block sample
ship = cards[0].select_one(".poly-component__shipping")
print("  shipping[0]:", ship.get_text(' ', strip=True) if ship else None)
for c in cards[:10]:
    fs = c.select_one('[aria-label*="Full" i]')
    if fs:
        print("  FULL sample aria-label:", fs.get("aria-label"))
        break

# 3) Installments
inst = sum(1 for c in cards if c.select_one(".poly-price__installments"))
print("\n[installments] cards with installments:", inst)
s = cards[0].select_one(".poly-price__installments")
print("  sample:", s.get_text(' ', strip=True) if s else None)

# 4) Coupons
cup = sum(1 for c in cards if c.select_one(".poly-component__coupons"))
print("[coupons] cards with coupons:", cup)

# 5) Seller name text (without the icon)
sel = cards[0].select_one(".poly-component__seller")
print("\n[seller] sample text:", sel.get_text(' ', strip=True) if sel else None)

# 6) "vendidos" — confirm rarity and where it sits
sold = [c for c in cards if re.search(r"vendid", c.get_text(' ', strip=True), re.I)]
print("\n[sold] cards mentioning vendidos:", len(sold))
for c in sold[:3]:
    m = re.search(r"[\w\.\+]+\s+vendid[oa]s", c.get_text(' ', strip=True), re.I)
    print("  ->", m.group(0) if m else "(no clean match)")

# 7) Ad / promoted flag (is_advertising in the link)
ads = sum(1 for c in cards if c.select_one('a[href*="is_advertising=true"]'))
print("\n[ads] cards flagged is_advertising:", ads)
