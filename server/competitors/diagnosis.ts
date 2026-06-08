/**
 * Competitor diagnosis — turns raw public data into an explainable answer to
 * the question the user cares about: "por que esse concorrente vende mais que
 * eu, mesmo com preço maior?".
 *
 * This module is pure (no network, no ML account) so it is trivially testable.
 * It receives MY listing baseline (own-account data passed by the caller) and
 * the competitor's public detail, and produces factor-by-factor comparisons
 * that go BEYOND price (reputation, Full, installments, social proof, photos).
 */

import type {
  CompetitorDiagnosis,
  CompetitorProductDetail,
  DiagnosisFactor,
  FactorAdvantage,
  MyListingBaseline,
} from "@shared/competitors";

function brl(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/** Reputation strength ranking — higher is better. */
const REP_RANK: Record<string, number> = {
  mercadolíder: 4,
  mercadolider: 4,
  "mercadolíder platinum": 6,
  "mercadolider platinum": 6,
  "mercadolíder gold": 5,
  "mercadolider gold": 5,
  verde: 3,
  green: 3,
  "5_green": 3,
};

function repRank(label: string | null): number {
  if (!label) return 0;
  const key = label.trim().toLowerCase();
  return REP_RANK[key] ?? (key.includes("líder") || key.includes("lider") ? 4 : 0);
}

/** Parse a "+10mil vendas" style hint into an approximate number. */
export function parsePastSales(hint: string | null): number | null {
  if (!hint) return null;
  const cleaned = hint.toLowerCase().replace(/\./g, "").replace(/,/g, ".");
  const m = cleaned.match(/([\d.]+)\s*(mil|mi|k)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (unit === "mil" || unit === "k") n *= 1_000;
  else if (unit === "mi") n *= 1_000_000;
  return Math.round(n);
}

/** True when a free-text shipping/label string suggests Mercado Envios Full. */
function detectFull(...texts: (string | null | undefined)[]): boolean | null {
  const joined = texts.filter(Boolean).join(" ").toLowerCase();
  if (!joined) return null;
  if (joined.includes("full")) return true;
  return null; // can't confirm absence reliably
}

/**
 * Build the diagnosis. Each factor returns an advantage from MY point of view:
 *  - "mine": I'm better on this factor
 *  - "theirs": the competitor is better (a reason they may sell more)
 *  - "tie" / "unknown"
 */
export function diagnoseCompetitor(
  myListing: MyListingBaseline,
  competitor: CompetitorProductDetail,
): CompetitorDiagnosis {
  const factors: DiagnosisFactor[] = [];

  // 1) Price ------------------------------------------------------------
  {
    const mine = myListing.price;
    const theirs = competitor.price;
    let advantage: FactorAdvantage = "unknown";
    let recommendation = "Sem dados de preço suficientes para comparar.";
    if (mine !== null && theirs !== null) {
      if (mine < theirs) {
        advantage = "mine";
        const diff = theirs - mine;
        recommendation = `Você já está ${brl(diff)} mais barato. Se ainda assim ele vende mais, o preço NÃO é o motivo — foque em reputação, Full e prova social.`;
      } else if (mine > theirs) {
        advantage = "theirs";
        recommendation = `O concorrente está ${brl(mine - theirs)} mais barato. Avalie se consegue aproximar o preço sem perder margem.`;
      } else {
        advantage = "tie";
        recommendation = "Preços equivalentes — a decisão de compra vem de outros fatores.";
      }
    }
    factors.push({
      factor: "Preço",
      myValue: brl(mine),
      competitorValue: brl(theirs),
      advantage,
      impact: "high",
      recommendation,
    });
  }

  // 2) Seller reputation -----------------------------------------------
  {
    const myRank = repRank(myListing.reputationLabel);
    const competitorLabel = competitor.sellerLabels[0] ?? null;
    const theirRank = repRank(competitorLabel);
    let advantage: FactorAdvantage = "unknown";
    let recommendation =
      "Reputação não disponível para comparação direta.";
    if (myRank > 0 || theirRank > 0) {
      if (myRank > theirRank) {
        advantage = "mine";
        recommendation = "Sua reputação é superior — destaque-a e mantenha os indicadores no verde.";
      } else if (theirRank > myRank) {
        advantage = "theirs";
        recommendation =
          "O concorrente tem reputação mais forte (ex.: MercadoLíder). Reputação influencia muito a posição na busca e a confiança do comprador — priorize melhorar seus indicadores.";
      } else {
        advantage = "tie";
        recommendation = "Reputação equivalente — diferencie-se em Full, fotos e prova social.";
      }
    }
    factors.push({
      factor: "Reputação do vendedor",
      myValue: myListing.reputationLabel ?? "—",
      competitorValue: competitorLabel ?? "—",
      advantage,
      impact: "high",
      recommendation,
    });
  }

  // 3) Social proof (ratings) ------------------------------------------
  {
    const mineCount = myListing.totalRatings ?? 0;
    const theirCount = competitor.totalRatings ?? 0;
    const mineRating = myListing.rating;
    const theirRating = competitor.rating;
    let advantage: FactorAdvantage = "unknown";
    let recommendation = "Sem dados de avaliações suficientes.";
    if (mineCount > 0 || theirCount > 0) {
      if (theirCount > mineCount * 1.2) {
        advantage = "theirs";
        recommendation =
          "O concorrente tem muito mais avaliações — isso gera confiança e empurra vendas. Incentive avaliações pós-compra (mensagem cordial + bom pós-venda).";
      } else if (mineCount > theirCount * 1.2) {
        advantage = "mine";
        recommendation = "Você tem mais prova social — exiba isso e mantenha a nota alta.";
      } else {
        advantage = "tie";
        recommendation = "Volume de avaliações parecido — mantenha a nota elevada.";
      }
    }
    const fmt = (c: number, r: number | null) =>
      c > 0 ? `${c} avaliações${r !== null ? ` · ${r.toFixed(1)}★` : ""}` : "—";
    factors.push({
      factor: "Prova social (avaliações)",
      myValue: fmt(mineCount, mineRating),
      competitorValue: fmt(theirCount, theirRating),
      advantage,
      impact: "high",
      recommendation,
    });
  }

  // 4) Mercado Envios Full ---------------------------------------------
  {
    const mineFull = myListing.hasFull;
    const theirFull = detectFull(...competitor.sellerLabels, competitor.description);
    let advantage: FactorAdvantage = "unknown";
    let recommendation =
      "Não foi possível confirmar o uso do Full pela coleta pública. Verifique manualmente — Full melhora prazo e posição na busca.";
    if (mineFull === true && theirFull === true) {
      advantage = "tie";
      recommendation = "Ambos usam Full — vantagem neutra nesse fator.";
    } else if (mineFull === true && theirFull !== true) {
      advantage = "mine";
      recommendation = "Você usa Full e ele aparentemente não — destaque a entrega rápida.";
    } else if (mineFull !== true && theirFull === true) {
      advantage = "theirs";
      recommendation =
        "O concorrente usa Full (entrega mais rápida e melhor posição na busca). Avalie migrar seu estoque para o Full.";
    } else if (mineFull === false) {
      recommendation =
        "Você não usa Full. O Full costuma aumentar conversão e posição — avalie aderir.";
    }
    factors.push({
      factor: "Logística (Mercado Envios Full)",
      myValue: mineFull === null ? "—" : mineFull ? "Sim" : "Não",
      competitorValue: theirFull === true ? "Sim" : "—",
      advantage,
      impact: "medium",
      recommendation,
    });
  }

  // 5) Installments / financing ----------------------------------------
  {
    const mine = myListing.hasFreeInstallments;
    let advantage: FactorAdvantage = "unknown";
    let recommendation =
      "Parcelamento sem juros aumenta conversão em tickets maiores — confirme se a oferta está ativa.";
    if (mine === true) {
      advantage = "mine";
      recommendation = "Você oferece parcelamento sem juros — mantenha como diferencial.";
    } else if (mine === false) {
      recommendation =
        "Você não oferece parcelamento sem juros. Para tickets acima de ~R$100 isso pode estar custando vendas.";
    }
    factors.push({
      factor: "Parcelamento sem juros",
      myValue: mine === null ? "—" : mine ? "Sim" : "Não",
      competitorValue: "—",
      advantage,
      impact: "medium",
      recommendation,
    });
  }

  // 6) Photos / listing quality ----------------------------------------
  {
    const mine = myListing.photosCount;
    const theirs = competitor.images.length || null;
    let advantage: FactorAdvantage = "unknown";
    let recommendation = "Listagens com 6+ fotos de qualidade convertem melhor.";
    if (mine !== null && theirs !== null) {
      if (mine >= theirs) {
        advantage = "mine";
        recommendation = "Você tem boa cobertura de fotos — mantenha imagens nítidas e variadas.";
      } else {
        advantage = "theirs";
        recommendation =
          "O concorrente tem mais fotos. Adicione imagens (uso, detalhes, escala) para reduzir dúvidas e aumentar conversão.";
      }
    }
    factors.push({
      factor: "Qualidade do anúncio (fotos)",
      myValue: mine === null ? "—" : `${mine} fotos`,
      competitorValue: theirs === null ? "—" : `${theirs} fotos`,
      advantage,
      impact: "low",
      recommendation,
    });
  }

  // Summary -------------------------------------------------------------
  const theirAdvantages = factors.filter(f => f.advantage === "theirs");
  const highTheirs = theirAdvantages.filter(f => f.impact === "high");
  let summary: string;
  if (theirAdvantages.length === 0) {
    summary =
      "Nos fatores analisados você não fica atrás do concorrente. Se ele ainda vende mais, investigue tempo de anúncio, palavras-chave do título e investimento em Ads.";
  } else {
    const drivers = (highTheirs.length ? highTheirs : theirAdvantages)
      .map(f => f.factor.toLowerCase())
      .join(", ");
    summary = `Provável(is) motivo(s) de o concorrente vender mais: ${drivers}. Aja primeiro nos fatores de alto impacto.`;
  }

  return { myListing, competitor, factors, summary };
}
