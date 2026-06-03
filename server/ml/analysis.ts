import type {
  ComparisonFactor,
  ComparisonResult,
  MlCategory,
  MlProduct,
  PotentialAnalysis,
  PotentialFactor,
} from "@shared/ml";

/**
 * Deterministic helpers reused for "simulated recent growth". Because the demo
 * data has no true time-series until the cron runs, we derive a stable
 * pseudo-growth from the product id so the value is consistent per product.
 */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Estimated short-term sales growth (%). When real snapshots exist they should
 * be passed in via `recentGrowthPercent`; otherwise we derive a stable value.
 */
export function estimateSalesGrowth(product: MlProduct, recentGrowthPercent?: number): number {
  if (typeof recentGrowthPercent === "number") return recentGrowthPercent;
  const seed = hashString(product.id + ":growth");
  // -15% .. +75%, biased upward for high-rating products.
  const base = ((seed % 1000) / 1000) * 90 - 15;
  const ratingBoost = (product.rating - 4) * 8;
  return Number((base + ratingBoost).toFixed(1));
}

/**
 * Price/rating efficiency: a higher rating at a lower relative price scores
 * better. Normalized 0..100 within the product's category context.
 */
function priceRatingScore(product: MlProduct, categoryMaxPrice: number): number {
  const priceFactor = 1 - Math.min(product.price / Math.max(categoryMaxPrice, 1), 1); // cheaper = higher
  const ratingFactor = (product.rating - 3.5) / 1.5; // 3.5..5 -> 0..1
  const reviewConfidence = Math.min(product.reviewsCount / 500, 1); // more reviews = more trust
  const score = (priceFactor * 0.45 + clamp(ratingFactor, 0, 1) * 0.4 + reviewConfidence * 0.15) * 100;
  return clamp(Number(score.toFixed(1)));
}

/**
 * Compute the composite potential analysis for a product. Every factor is
 * returned with an explanation so the UI can show WHY (transparency rule).
 */
export function analyzePotential(
  product: MlProduct,
  category: MlCategory,
  ctx: { categoryMaxPrice: number; categoryMaxSold: number; recentGrowthPercent?: number },
): PotentialAnalysis {
  const salesGrowthPercent = estimateSalesGrowth(product, ctx.recentGrowthPercent);
  const growthScore = clamp(((salesGrowthPercent + 15) / 90) * 100);

  const prScore = priceRatingScore(product, ctx.categoryMaxPrice);

  const demandScore = clamp(category.demandIndex);

  const salesVolumeScore = clamp(
    (product.soldQuantity / Math.max(ctx.categoryMaxSold, 1)) * 100,
  );

  const trustScore = clamp(
    (product.seller.positiveRatingRatio - 0.85) / 0.15 * 60 +
      (product.seller.powerSellerStatus ? 25 : 0) +
      (product.officialStore ? 15 : 0),
  );

  const logisticsScore = clamp(
    (product.freeShipping ? 60 : 20) + Math.min(product.pictureCount, 8) * 5,
  );

  const factors: PotentialFactor[] = [
    {
      key: "growth",
      label: "Crescimento recente de vendas",
      score: growthScore,
      weight: 0.3,
      explanation:
        salesGrowthPercent >= 0
          ? `Vendas em alta de aproximadamente ${salesGrowthPercent}% no período recente, sinal de aquecimento da demanda.`
          : `Vendas em queda de ${Math.abs(salesGrowthPercent)}% no período recente, indicando desaceleração.`,
    },
    {
      key: "price_rating",
      label: "Relação preço / avaliação",
      score: prScore,
      weight: 0.2,
      explanation: `Nota ${product.rating.toFixed(1)} com ${product.reviewsCount} avaliações a R$ ${product.price.toFixed(
        2,
      )} — ${prScore >= 60 ? "ótimo" : prScore >= 40 ? "razoável" : "fraco"} custo-benefício frente à categoria.`,
    },
    {
      key: "demand",
      label: "Demanda da categoria",
      score: demandScore,
      weight: 0.2,
      explanation: `A categoria "${category.name}" tem índice de demanda ${category.demandIndex}/100, ${
        demandScore >= 80 ? "muito aquecida" : demandScore >= 65 ? "aquecida" : "moderada"
      }.`,
    },
    {
      key: "volume",
      label: "Volume de vendas atual",
      score: salesVolumeScore,
      weight: 0.15,
      explanation: `${product.soldQuantity.toLocaleString("pt-BR")} unidades vendidas, ${
        salesVolumeScore >= 60 ? "entre os líderes" : "abaixo dos líderes"
      } da categoria.`,
    },
    {
      key: "trust",
      label: "Reputação do vendedor",
      score: trustScore,
      weight: 0.1,
      explanation: `Vendedor com ${(product.seller.positiveRatingRatio * 100).toFixed(
        1,
      )}% de avaliações positivas${product.seller.powerSellerStatus ? `, MercadoLíder ${product.seller.powerSellerStatus}` : ""}${
        product.officialStore ? ", loja oficial" : ""
      }.`,
    },
    {
      key: "logistics",
      label: "Frete e qualidade do anúncio",
      score: logisticsScore,
      weight: 0.05,
      explanation: `${product.freeShipping ? "Oferece frete grátis" : "Sem frete grátis"} e ${product.pictureCount} foto(s) no anúncio.`,
    },
  ];

  const potentialScore = clamp(
    Number(factors.reduce((sum, f) => sum + f.score * f.weight, 0).toFixed(1)),
  );

  const verdict: PotentialAnalysis["verdict"] =
    potentialScore >= 70 ? "alto" : potentialScore >= 50 ? "medio" : "baixo";

  return {
    product,
    potentialScore,
    salesGrowthPercent,
    priceRatingScore: prScore,
    categoryDemand: demandScore,
    factors,
    verdict,
  };
}

/**
 * Rank a list of products by potential, returning the full analysis for each.
 */
export function rankByPotential(
  products: MlProduct[],
  category: MlCategory,
): PotentialAnalysis[] {
  const categoryMaxPrice = Math.max(...products.map((p) => p.price), 1);
  const categoryMaxSold = Math.max(...products.map((p) => p.soldQuantity), 1);
  return products
    .map((p) => analyzePotential(p, category, { categoryMaxPrice, categoryMaxSold }))
    .sort((a, b) => b.potentialScore - a.potentialScore);
}

// ---- Comparison ----------------------------------------------------------

function reputationRank(level: string): number {
  const order = ["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"];
  const idx = order.indexOf(level);
  return idx < 0 ? 0 : (idx / (order.length - 1)) * 100;
}

/**
 * Side-by-side comparison across well-defined factors. For each factor we
 * score every product, choose a winner, and explain the difference.
 */
export function compareProducts(products: MlProduct[]): ComparisonResult {
  if (products.length < 2) {
    throw new Error("É necessário pelo menos 2 produtos para comparar.");
  }

  const factors: ComparisonFactor[] = [];

  const addFactor = (
    key: string,
    label: string,
    valueFn: (p: MlProduct) => { raw: string; score: number },
    explainFn: (winner: MlProduct, products: MlProduct[]) => string,
  ) => {
    const values: ComparisonFactor["values"] = {};
    for (const p of products) values[p.id] = valueFn(p);
    let winnerId = products[0].id;
    for (const p of products) {
      if (values[p.id].score > values[winnerId].score) winnerId = p.id;
    }
    const winner = products.find((p) => p.id === winnerId)!;
    factors.push({ key, label, values, winnerId, explanation: explainFn(winner, products) });
  };

  const maxPrice = Math.max(...products.map((p) => p.price), 1);

  addFactor(
    "price",
    "Preço",
    (p) => ({ raw: `R$ ${p.price.toFixed(2)}`, score: (1 - p.price / maxPrice) * 100 }),
    (w) => `${shortTitle(w)} tem o menor preço (R$ ${w.price.toFixed(2)}), tornando-o mais competitivo na decisão de compra.`,
  );

  addFactor(
    "rating",
    "Avaliação",
    (p) => ({ raw: `${p.rating.toFixed(1)} ★ (${p.reviewsCount})`, score: p.rating * 20 }),
    (w) => `${shortTitle(w)} possui a melhor avaliação (${w.rating.toFixed(1)}★ com ${w.reviewsCount} avaliações), gerando mais confiança.`,
  );

  addFactor(
    "sales",
    "Volume de vendas",
    (p) => ({ raw: `${p.soldQuantity.toLocaleString("pt-BR")} vendidos`, score: p.soldQuantity }),
    (w) => `${shortTitle(w)} lidera em vendas (${w.soldQuantity.toLocaleString("pt-BR")} unidades), prova social que impulsiona novas compras.`,
  );

  addFactor(
    "shipping",
    "Frete grátis",
    (p) => ({ raw: p.freeShipping ? "Sim" : "Não", score: p.freeShipping ? 100 : 0 }),
    (w) => `${shortTitle(w)} oferece frete grátis, um fator decisivo de conversão no Mercado Livre.`,
  );

  addFactor(
    "seller",
    "Reputação do vendedor",
    (p) => ({
      raw: `${(p.seller.positiveRatingRatio * 100).toFixed(0)}%${p.seller.powerSellerStatus ? ` · ${p.seller.powerSellerStatus}` : ""}`,
      score: reputationRank(p.seller.reputationLevel) * 0.6 + p.seller.positiveRatingRatio * 40,
    }),
    (w) => `${shortTitle(w)} tem o vendedor mais bem avaliado (${(w.seller.positiveRatingRatio * 100).toFixed(0)}% positivas), reduzindo o risco percebido.`,
  );

  addFactor(
    "pictures",
    "Qualidade das fotos",
    (p) => ({ raw: `${p.pictureCount} foto(s)`, score: Math.min(p.pictureCount, 10) * 10 }),
    (w) => `${shortTitle(w)} apresenta mais imagens (${w.pictureCount}), o que aumenta a clareza e a taxa de conversão do anúncio.`,
  );

  addFactor(
    "title",
    "Qualidade do título",
    (p) => ({ raw: `${p.title.length} caracteres`, score: titleQuality(p.title) }),
    (w) => `${shortTitle(w)} tem um título mais completo e descritivo, favorecendo a busca e a relevância.`,
  );

  addFactor(
    "position",
    "Posicionamento na busca",
    (p) => ({ raw: `#${p.catalogPosition ?? "-"}`, score: 100 - Math.min((p.catalogPosition ?? 50), 50) * 2 }),
    (w) => `${shortTitle(w)} aparece melhor posicionado (#${w.catalogPosition}) nos resultados, capturando mais visibilidade.`,
  );

  // Overall winner: count factor wins weighted lightly toward sales & rating.
  const wins: Record<string, number> = {};
  for (const p of products) wins[p.id] = 0;
  const weights: Record<string, number> = {
    price: 1.1,
    rating: 1.2,
    sales: 1.3,
    shipping: 1,
    seller: 1.1,
    pictures: 0.8,
    title: 0.8,
    position: 1,
  };
  for (const f of factors) wins[f.winnerId] += weights[f.key] ?? 1;

  let overallWinnerId = products[0].id;
  for (const p of products) if (wins[p.id] > wins[overallWinnerId]) overallWinnerId = p.id;
  const overall = products.find((p) => p.id === overallWinnerId)!;

  const winningFactors = factors.filter((f) => f.winnerId === overallWinnerId).map((f) => f.label.toLowerCase());
  const summary = `${shortTitle(overall)} se destaca como a melhor opção geral, vencendo em ${winningFactors.length} de ${factors.length} critérios${
    winningFactors.length ? ` (${winningFactors.slice(0, 3).join(", ")})` : ""
  }. Isso explica por que tende a vender mais que os concorrentes diretos.`;

  return { products, factors, overallWinnerId, summary };
}

function shortTitle(p: MlProduct): string {
  return p.title.length > 40 ? p.title.slice(0, 37) + "..." : p.title;
}

function titleQuality(title: string): number {
  // Reward informative titles: length sweet spot ~40-60 chars, presence of numbers/specs.
  const len = title.length;
  const lengthScore = len >= 35 && len <= 65 ? 100 : len < 35 ? (len / 35) * 100 : Math.max(40, 100 - (len - 65));
  const hasSpec = /\d/.test(title) ? 1 : 0.85;
  return clamp(lengthScore * hasSpec);
}
