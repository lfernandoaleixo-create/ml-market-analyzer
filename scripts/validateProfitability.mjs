// Quick end-to-end validation of the profitability pipeline against the REAL
// BaseLinker account, using tsx to import the TS modules directly.
import { getInventories, getProductCosts, getOrders } from "../server/baselinker/provider.ts";
import { buildProfitability } from "../server/finance/profitability.ts";
import { defaultTaxConfig } from "../shared/finance.ts";

const fmt = (n) => `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const invs = await getInventories();
  console.log("Catálogos:", invs);
  const inv = invs[0];
  if (!inv) throw new Error("Sem catálogo");

  const from = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const [costs, orders] = await Promise.all([
    getProductCosts(inv.inventoryId),
    getOrders(from),
  ]);
  console.log(`Produtos com custo (por id): ${costs.byId.size}; pedidos (30d): ${orders.length}`);

  const cfg = defaultTaxConfig();
  const res = buildProfitability({ orders, costs, config: cfg, from, to: Date.now() });

  console.log("\n=== TOTAIS (SEM TTS) ===");
  console.log("Receita:", fmt(res.totals.revenue));
  console.log("Comissão ML:", fmt(res.totals.commission));
  console.log("Frete:", fmt(res.totals.shipping));
  console.log("CMV:", fmt(res.totals.cmv));
  console.log("Imposto (estim.):", fmt(res.totals.tax));
  console.log("Lucro líquido:", fmt(res.totals.netProfit), "| margem:", res.totals.margin != null ? (res.totals.margin * 100).toFixed(1) + "%" : "—");

  console.log("\n=== COMPARATIVO ===");
  console.log("Lucro SEM TTS:", fmt(res.comparison.semTts.netProfit));
  console.log("Lucro COM TTS:", fmt(res.comparison.comTts.netProfit));
  console.log("Ganho com TTS:", fmt(res.comparison.ttsGain));

  console.log("\n=== TOP 5 ANÚNCIOS (lucro) ===");
  for (const l of res.listings.slice(0, 5)) {
    console.log(`${l.itemId} | ${l.title?.slice(0, 40)} | un:${l.unitsSold} | lucro:${fmt(l.current.netProfit)} | custo unit:${l.unitCost != null ? fmt(l.unitCost) : "?"}${l.missingCost ? " (custo parcial)" : ""}`);
  }

  console.log("\nProdutos sem custo:", res.productsMissingCost);
  console.log("Distribuição por UF (top 5):", res.byUF.slice(0, 5));
}

main().catch((e) => { console.error("ERRO:", e?.message ?? e); process.exit(1); });
