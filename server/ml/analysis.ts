import type {
  ComparisonFactor,
  ComparisonResult,
  MlCategory,
  MlProduct,
  PotentialAnalysis,
  PotentialFactor,
} from "@shared/ml";

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Price competitiveness within the category context: a lower price relative to
 * the category maximum scores higher. This uses ONLY the real listing price
 * (no synthetic rating component), so it stays trustworthy even when the ML API
 * does not expose ratings for non-certified apps.
 */
function priceCompetitivenessScore(product: MlProduct, categoryMaxPrice: number): number {
  if (product.priceAvailable === false || !(product.price > 0)) return 0;
  const priceFactor = 1 - Math.min(product.price / Math.max(categoryMaxPrice, 1), 1); // cheaper = higher
  return clamp(Number((priceFactor * 100).toFixed(1)));
}

/**
 * Compute the composite potential analysis for a product. Every factor is
 * returned with an explanation so the UI can show WHY (transparency rule).
 */
export function analyzePotential(
  product: MlProduct,
  category: MlCategory,
  ctx: { categoryMaxPrice: number; categoryMaxSold: number },
): PotentialAnalysis {
  // ── FATORES 100% REAIS ──────────────────────────────────────────────────
  // Todos os fatores abaixo derivam de dados que a API realmente entrega.
  // Nada de "crescimento recente" pseudo-aleatório nem "demanda fixa".

  // 1) Preço competitivo (real): menor preço relativo à categoria pontua mais.
  const priceScore = priceCompetitivenessScore(product, ctx.categoryMaxPrice);
  const priceKnown = product.priceAvailable !== false && product.price > 0;

  // 2) Presença/posição nos mais vendidos (real): catalogPosition vem dos
  //    destaques oficiais da categoria. Posição 1 = 100, decaindo até ~50º.
  const hasRank = typeof product.catalogPosition === "number" && product.catalogPosition > 0;
  const bestSellerScore = hasRank
    ? clamp(100 - (Math.min(product.catalogPosition as number, 50) - 1) * 2)
    : 0;

  // 3) Reputação do vendedor (real): nível + % positivas + MercadoLíder + loja oficial.
  const trustScore = clamp(
    reputationRank(product.seller.reputationLevel) * 0.5 +
      clamp((product.seller.positiveRatingRatio - 0.85) / 0.15 * 100) * 0.3 +
      (product.seller.powerSellerStatus ? 12 : 0) +
      (product.officialStore ? 8 : 0),
  );

  // 4) Frete grátis + qualidade do anúncio (real): frete e nº de fotos.
  const logisticsScore = clamp(
    (product.freeShipping ? 60 : 20) + Math.min(product.pictureCount, 8) * 5,
  );

  const factors: PotentialFactor[] = [
    {
      key: "price",
      label: "Preço competitivo",
      score: priceScore,
      weight: 0.35,
      explanation: priceKnown
        ? `Preço de R$ ${product.price.toFixed(2)} — ${
            priceScore >= 60 ? "abaixo" : priceScore >= 40 ? "em linha com" : "acima"
          } da média da categoria, o que ${priceScore >= 50 ? "favorece" : "dificulta"} a conversão.`
        : "Preço não disponível pela API para este item (sem oferta ativa); fator não pontuado.",
    },
    {
      key: "best_seller",
      label: "Presença nos mais vendidos",
      score: bestSellerScore,
      weight: 0.3,
      explanation: hasRank
        ? `Aparece na posição #${product.catalogPosition} entre os mais vendidos da categoria "${category.name}" — sinal real de demanda.`
        : "Não aparece no ranking de mais vendidos da categoria.",
    },
    {
      key: "trust",
      label: "Reputação do vendedor",
      score: trustScore,
      weight: 0.2,
      explanation: `Vendedor com ${(product.seller.positiveRatingRatio * 100).toFixed(
        0,
      )}% de avaliações positivas${product.seller.powerSellerStatus ? `, MercadoLíder ${product.seller.powerSellerStatus}` : ""}${
        product.officialStore ? ", loja oficial" : ""
      }.`,
    },
    {
      key: "logistics",
      label: "Frete e qualidade do anúncio",
      score: logisticsScore,
      weight: 0.15,
      explanation: `${product.freeShipping ? "Oferece frete grátis" : "Sem frete grátis"} e ${product.pictureCount} foto(s) no anúncio.`,
    },
  ];

  // Avaliação só entra como fator quando o dado REALMENTE existe (raro em apps
  // não-certificadas). Quando entra, redistribui peso sem inventar nota.
  if (product.ratingAvailable === true && product.reviewsCount > 0) {
    factors.push({
      key: "rating",
      label: "Avaliação dos compradores",
      score: clamp(product.rating * 20),
      weight: 0.15,
      explanation: `Nota ${product.rating.toFixed(1)} com ${product.reviewsCount} avaliação(ões) — prova social real.`,
    });
  }

  // Score composto ponderado pelos pesos reais presentes (normalizado pela
  // soma dos pesos, para não penalizar itens sem avaliação disponível).
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const potentialScore = clamp(
    Number((factors.reduce((sum, f) => sum + f.score * f.weight, 0) / Math.max(totalWeight, 0.0001)).toFixed(1)),
  );

  const verdict: PotentialAnalysis["verdict"] =
    potentialScore >= 70 ? "alto" : potentialScore >= 50 ? "medio" : "baixo";

  return {
    product,
    potentialScore,
    priceScore,
    bestSellerScore,
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

  // Avaliação só entra como critério quando TODOS os produtos têm nota real
  // disponível — caso contrário a comparação seria injusta/inventada.
  const allRatingsKnown = products.every(
    (p) => p.ratingAvailable === true && p.reviewsCount > 0,
  );
  if (allRatingsKnown) {
    addFactor(
      "rating",
      "Avaliação",
      (p) => ({ raw: `${p.rating.toFixed(1)} ★ (${p.reviewsCount})`, score: p.rating * 20 }),
      (w) => `${shortTitle(w)} possui a melhor avaliação (${w.rating.toFixed(1)}★ com ${w.reviewsCount} avaliações), gerando mais confiança.`,
    );
  }

  // Volume de vendas só entra quando TODOS os produtos têm o dado real.
  const allSalesKnown = products.every(
    (p) => p.salesAvailable !== false && p.soldQuantity > 0,
  );
  if (allSalesKnown) {
    addFactor(
      "sales",
      "Volume de vendas",
      (p) => ({ raw: `${p.soldQuantity.toLocaleString("pt-BR")} vendidos`, score: p.soldQuantity }),
      (w) => `${shortTitle(w)} lidera em vendas (${w.soldQuantity.toLocaleString("pt-BR")} unidades), prova social que impulsiona novas compras.`,
    );
  }

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
