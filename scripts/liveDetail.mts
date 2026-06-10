import { getCompetitorDetail } from "../server/competitors/competitorDetail";

const url = process.argv[2];
if (!url) {
  console.error("usage: tsx scripts/liveDetail.mts <product-url>");
  process.exit(1);
}

const started = Date.now();
try {
  const d = await getCompetitorDetail(url);
  const ms = Date.now() - started;
  console.log(`OK in ${ms}ms`);
  console.log(JSON.stringify(
    { name: d.name, price: d.price, image: d.image, images: d.images.length, labels: d.sellerLabels, sold: d.sellerSales },
    null,
    2,
  ));
} catch (err) {
  const ms = Date.now() - started;
  console.error(`FAILED in ${ms}ms:`, err instanceof Error ? err.message : err);
  process.exit(2);
}
