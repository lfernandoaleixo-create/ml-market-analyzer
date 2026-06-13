/**
 * adsAudit — PURE logic for the Mamba audit and category tracking.
 *
 * This file holds no I/O: it only transforms data already fetched from the
 * Mercado Ads API (campaigns + ads) plus stored snapshots. Keeping it pure
 * makes every rule unit-testable and keeps the provider/router thin.
 *
 * Two responsibilities:
 *  1) categorize(title)         → which product family an ad belongs to.
 *  2) diffCampaigns(prev, curr) → what changed between two daily snapshots,
 *     with a coherence verdict + "what we would do" recommendation.
 */
import type {
  AdsAdRow,
  AdsCampaign,
  AdsCategoryKey,
  AdsCategoryStat,
  AdsChangeVerdict,
  AdsMetrics,
} from "@shared/ads";
import { isActiveAdStatus } from "./adsProvider";

/* ------------------------------------------------------------------ *
 * 1. Categorization
 * ------------------------------------------------------------------ */

/** Normalize a title: lowercase + strip accents, so matching is robust. */
export function normalizeTitle(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Deterministic title → category mapping. Order matters: the most specific
 * rules come first. Validated against the seller's real 130 active titles
 * (espetos/churrasco, manicure/unha, fibra de algodão, varetas de madeira
 * difusor, hashi, palito de dente/caixinhas).
 */
export function categorize(title: string): AdsCategoryKey {
  const t = normalizeTitle(title);

  // Hashi (very specific keyword).
  if (t.includes("hashi")) return "hashi";

  // Manicure / nails.
  if (t.includes("manicure") || (t.includes("unha") && t.includes("palito")))
    return "manicure";

  // Aromatizador — split fibra vs madeira.
  if (t.includes("aromatizador") || t.includes("difusor") || t.includes("vareta")) {
    if (t.includes("fibra")) return "aroma_fibra";
    if (t.includes("madeira") || t.includes("difusor") || t.includes("aromatizador"))
      return "aroma_madeira";
  }
  if (t.includes("fibra de algodao")) return "aroma_fibra";

  // Espetos / churrasco (and cotton-candy sticks, which are skewers of wood).
  if (t.includes("espeto") || t.includes("churrasco") || t.includes("algodao doce"))
    return "espetos";

  // Toothpicks / bamboo picks.
  if (
    t.includes("palito de dente") ||
    t.includes("caixinhas palito") ||
    t.includes("palito de bambu") ||
    (t.includes("palito") && t.includes("bambu"))
  )
    return "palitos_bambu";

  return "outros";
}

/* ------------------------------------------------------------------ *
 * 2. Metric helpers (shared with provider but duplicated pure here)
 * ------------------------------------------------------------------ */

export function emptyMetrics(): AdsMetrics {
  return {
    clicks: 0, prints: 0, cost: 0, cpc: 0, ctr: 0, acos: 0, sov: 0,
    directAmount: 0, indirectAmount: 0, totalAmount: 0,
    directUnits: 0, indirectUnits: 0, units: 0, organicUnits: 0, organicItems: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumMetrics(list: AdsMetrics[]): AdsMetrics {
  const acc = emptyMetrics();
  for (const m of list) {
    acc.clicks += m.clicks;
    acc.prints += m.prints;
    acc.cost += m.cost;
    acc.directAmount += m.directAmount;
    acc.indirectAmount += m.indirectAmount;
    acc.totalAmount += m.totalAmount;
    acc.directUnits += m.directUnits;
    acc.indirectUnits += m.indirectUnits;
    acc.units += m.units;
    acc.organicUnits += m.organicUnits;
    acc.organicItems += m.organicItems;
  }
  acc.cpc = acc.clicks > 0 ? round2(acc.cost / acc.clicks) : 0;
  acc.ctr = acc.prints > 0 ? round2((acc.clicks / acc.prints) * 100) : 0;
  acc.acos = acc.totalAmount > 0 ? round2((acc.cost / acc.totalAmount) * 100) : 0;
  acc.sov = 0;
  return acc;
}

function derive(m: AdsMetrics) {
  return {
    roas: m.cost > 0 ? round2(m.totalAmount / m.cost) : null,
    acos: m.totalAmount > 0 ? round2((m.cost / m.totalAmount) * 100) : null,
    conversionRate: m.clicks > 0 ? round2((m.units / m.clicks) * 100) : null,
    organicShare:
      m.units + m.organicUnits > 0
        ? round2((m.organicUnits / (m.units + m.organicUnits)) * 100)
        : null,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Category aggregation
 * ------------------------------------------------------------------ */

export function buildCategoryStats(
  ads: AdsAdRow[],
  labels: Record<AdsCategoryKey, string>,
): AdsCategoryStat[] {
  const groups = new Map<AdsCategoryKey, AdsAdRow[]>();
  for (const ad of ads) {
    const key = categorize(ad.title);
    const list = groups.get(key) ?? [];
    list.push(ad);
    groups.set(key, list);
  }

  const stats: AdsCategoryStat[] = [];
  for (const [key, list] of Array.from(groups.entries())) {
    const metrics = sumMetrics(list.map((a: AdsAdRow) => a.metrics));
    const sampleAds = [...list]
      .sort((a: AdsAdRow, b: AdsAdRow) => b.metrics.cost - a.metrics.cost)
      .slice(0, 5);
    stats.push({
      key,
      label: labels[key as AdsCategoryKey] ?? key,
      adCount: list.length,
      activeAdCount: list.filter((a: AdsAdRow) => isActiveAdStatus(a.status)).length,
      metrics,
      derived: derive(metrics),
      sampleAds,
    });
  }
  // Sort by spend desc so the most relevant families come first.
  stats.sort((a, b) => b.metrics.cost - a.metrics.cost);
  return stats;
}

/* ------------------------------------------------------------------ *
 * 4. Change detection + coherence verdict
 * ------------------------------------------------------------------ */

/** Minimal shape of a stored campaign snapshot, used for diffing. */
export type CampaignSnapshotLike = {
  campaignId: number;
  name: string;
  status: string;
  strategy: string | null;
  acosTarget: number | null;
  budget: number | null;
  automaticBudget: boolean;
};

export type DetectedChange = {
  campaignId: number;
  campaignName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  verdict: AdsChangeVerdict;
  assessment: string;
  recommendation: string;
};

export function toSnapshotLike(c: AdsCampaign): CampaignSnapshotLike {
  return {
    campaignId: c.id,
    name: c.name,
    status: c.status,
    strategy: c.strategy ?? null,
    acosTarget: c.acosTarget,
    budget: c.budget,
    automaticBudget: c.automaticBudget,
  };
}

function fmt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? "ligado" : "desligado";
  return String(v);
}

/**
 * Compare the previous and current snapshot of the SAME campaign and emit one
 * DetectedChange per changed controllable field. The coherence verdict is a
 * transparent heuristic based on the campaign's own performance (metrics),
 * so the team can see WHY we agree or disagree with the agency's move.
 */
export function diffCampaign(
  prev: CampaignSnapshotLike,
  curr: CampaignSnapshotLike,
  metrics: AdsMetrics,
): DetectedChange[] {
  const out: DetectedChange[] = [];
  const acos = metrics.totalAmount > 0 ? (metrics.cost / metrics.totalAmount) * 100 : null;
  const base = { campaignId: curr.campaignId, campaignName: curr.name };

  // Status change (paused/active).
  if (prev.status !== curr.status) {
    let verdict: AdsChangeVerdict = "neutral";
    let assessment = `A campanha mudou de "${prev.status}" para "${curr.status}".`;
    let recommendation = "Acompanhar o efeito nos próximos dias.";
    if (curr.status === "paused") {
      if (acos != null && acos > (curr.acosTarget ?? 100) * 1.5) {
        verdict = "coherent";
        assessment += ` O ACOS estava em ${acos.toFixed(1)}%, bem acima do alvo — pausar reduz desperdício.`;
        recommendation = "Concordamos. Antes de reativar, revisar palavras/itens que geraram gasto sem venda.";
      } else if (metrics.totalAmount > 0 && acos != null && acos <= (curr.acosTarget ?? 0)) {
        verdict = "questionable";
        assessment += ` Mas a campanha vinha com ACOS ${acos.toFixed(1)}% dentro do alvo e gerando receita — pausar pode estar cortando vendas saudáveis.`;
        recommendation = "Nós manteríamos ativa e otimizaríamos lances, em vez de pausar.";
      }
    } else if (curr.status === "active") {
      verdict = "neutral";
      assessment += " Reativação — vamos medir o retorno a partir de agora.";
    }
    out.push({ ...base, field: "status", oldValue: fmt(prev.status), newValue: fmt(curr.status), verdict, assessment, recommendation });
  }

  // ACOS target change.
  if ((prev.acosTarget ?? null) !== (curr.acosTarget ?? null)) {
    const up = (curr.acosTarget ?? 0) > (prev.acosTarget ?? 0);
    let verdict: AdsChangeVerdict = "neutral";
    let assessment = `ACOS-alvo alterado de ${fmt(prev.acosTarget) ?? "—"}% para ${fmt(curr.acosTarget) ?? "—"}%.`;
    let recommendation = "";
    if (up) {
      verdict = acos != null && acos > (prev.acosTarget ?? 0) ? "questionable" : "neutral";
      assessment += " Elevar o ACOS-alvo aumenta o teto de gasto por venda (mais volume, menos margem).";
      recommendation = "Só faríamos isso se o objetivo for ganhar volume/posição; se o foco é lucro, manteríamos o alvo menor.";
    } else {
      verdict = "coherent";
      assessment += " Reduzir o ACOS-alvo prioriza lucratividade.";
      recommendation = "Concordamos com a direção, desde que não derrube o volume de vendas relevantes.";
    }
    out.push({ ...base, field: "acosTarget", oldValue: fmt(prev.acosTarget), newValue: fmt(curr.acosTarget), verdict, assessment, recommendation });
  }

  // Budget change.
  if ((prev.budget ?? null) !== (curr.budget ?? null)) {
    const up = (curr.budget ?? 0) > (prev.budget ?? 0);
    let verdict: AdsChangeVerdict = "neutral";
    let assessment = `Orçamento alterado de R$ ${fmt(prev.budget) ?? "—"} para R$ ${fmt(curr.budget) ?? "—"}.`;
    let recommendation = "";
    const roas = metrics.cost > 0 ? metrics.totalAmount / metrics.cost : null;
    if (up) {
      if (roas != null && roas >= 3) {
        verdict = "coherent";
        assessment += ` A campanha tem ROAS ${roas.toFixed(1)}x — aumentar verba em algo que dá retorno é acertado.`;
        recommendation = "Concordamos em escalar; acompanhar para o ACOS não subir junto.";
      } else {
        verdict = "questionable";
        assessment += ` Mas o ROAS está em ${roas != null ? roas.toFixed(1) + "x" : "indefinido"} — aumentar verba sem retorno comprovado tende a queimar caixa.`;
        recommendation = "Nós só aumentaríamos após a campanha provar ROAS saudável.";
      }
    } else {
      verdict = "neutral";
      assessment += " Redução de verba — pode ser controle de gasto.";
      recommendation = "Verificar se não está limitando uma campanha lucrativa.";
    }
    out.push({ ...base, field: "budget", oldValue: fmt(prev.budget), newValue: fmt(curr.budget), verdict, assessment, recommendation });
  }

  // Automatic budget toggle.
  if (prev.automaticBudget !== curr.automaticBudget) {
    out.push({
      ...base,
      field: "automaticBudget",
      oldValue: fmt(prev.automaticBudget),
      newValue: fmt(curr.automaticBudget),
      verdict: "neutral",
      assessment: `Orçamento automático ${curr.automaticBudget ? "ligado" : "desligado"}.`,
      recommendation: curr.automaticBudget
        ? "Orçamento automático tira o controle fino do gasto diário; nós preferimos teto manual para previsibilidade."
        : "Voltar ao orçamento manual devolve previsibilidade ao gasto.",
    });
  }

  // Strategy change.
  if ((prev.strategy ?? null) !== (curr.strategy ?? null)) {
    out.push({
      ...base,
      field: "strategy",
      oldValue: fmt(prev.strategy),
      newValue: fmt(curr.strategy),
      verdict: "neutral",
      assessment: `Estratégia alterada de ${fmt(prev.strategy) ?? "—"} para ${fmt(curr.strategy) ?? "—"}.`,
      recommendation: "Avaliar se a nova estratégia condiz com o objetivo (lucro x volume x visibilidade).",
    });
  }

  return out;
}

/** Our read-only verdict on the CURRENT configuration of a campaign. */
export function judgeCurrentConfig(
  c: AdsCampaign,
): { verdict: AdsChangeVerdict; comment: string } {
  const m = c.metrics;
  const acos = m.totalAmount > 0 ? (m.cost / m.totalAmount) * 100 : null;
  const roas = m.cost > 0 ? m.totalAmount / m.cost : null;

  if (m.cost > 0 && m.totalAmount === 0) {
    return {
      verdict: "questionable",
      comment: `Gastou R$ ${m.cost.toFixed(2)} sem nenhuma venda atribuída. Nós revisaríamos itens/lances ou pausaríamos até ajustar.`,
    };
  }
  if (acos != null && c.acosTarget != null && acos > c.acosTarget * 1.3) {
    return {
      verdict: "questionable",
      comment: `ACOS real ${acos.toFixed(1)}% acima do alvo ${c.acosTarget}%. Reduziríamos lances dos itens mais caros.`,
    };
  }
  if (roas != null && roas >= 3 && c.status === "active") {
    return {
      verdict: "coherent",
      comment: `ROAS ${roas.toFixed(1)}x com ACOS saudável. Configuração coerente — dá para escalar com cuidado.`,
    };
  }
  return {
    verdict: "neutral",
    comment: "Configuração dentro do esperado; seguimos monitorando o desempenho.",
  };
}
