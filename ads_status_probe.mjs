const TOKEN = process.env.ML_TOKEN;
const SITE = "MLB";
const H = { Authorization: `Bearer ${TOKEN}` };

async function j(url) {
  const r = await fetch(url, { headers: H });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const me = await j("https://api.mercadolibre.com/users/me");
const userId = me.body?.id;
const adv = await j(`https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`);
// advertiser id discovery via the same path the provider uses
const advRes = await j(`https://api.mercadolibre.com/marketplace/advertising/advertisers?product_id=PADS`);
let advertiserId = null;
for (const cand of [adv.body, advRes.body]) {
  const list = cand?.advertisers || cand?.results;
  if (Array.isArray(list) && list.length) { advertiserId = list[0].advertiser_id ?? list[0].id; break; }
}
console.log("user", userId, "advertiser", advertiserId);
if (!advertiserId) process.exit(0);

const now = new Date();
const from = new Date(now.getTime() - 30 * 86400000);
const fmt = (d) => d.toISOString().slice(0, 10);
const dateParams = `date_from=${fmt(from)}&date_to=${fmt(now)}`;

const counts = {};
let offset = 0;
for (let p = 0; p < 20; p++) {
  const url = `https://api.mercadolibre.com/marketplace/advertising/${SITE}/advertisers/${advertiserId}/product_ads/ads/search?limit=50&offset=${offset}&${dateParams}`;
  const res = await j(url);
  const results = res.body?.results || [];
  for (const a of results) counts[a.status ?? "(none)"] = (counts[a.status ?? "(none)"] || 0) + 1;
  const total = res.body?.paging?.total ?? 0;
  offset += 50;
  if (offset >= total || results.length === 0) break;
}
console.log("ads status distribution:", JSON.stringify(counts, null, 2));
