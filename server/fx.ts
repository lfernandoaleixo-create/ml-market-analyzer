/**
 * Câmbio em tempo real para o custo-alvo de importação.
 *
 * Fonte primária: AwesomeAPI (https://economia.awesomeapi.com.br/json/last/USD-BRL,CNY-BRL).
 * - Cache curto em memória (60s) para não martelar a API a cada tecla.
 * - Fallback: última cotação conhecida; se nunca houve sucesso, usa os DEFAULT_*.
 *
 * A função pura de parse é exportada para teste (parsePairBrl).
 */

/** Cotações de fallback caso a API esteja indisponível e não haja cache. */
export const DEFAULT_USD_BRL = 5.4;
export const DEFAULT_CNY_BRL = 0.75;

/** Tempo de validade do cache (ms). */
const CACHE_TTL_MS = 60_000;

export interface FxRate {
  /** Quantos reais vale 1 dólar (USD→BRL). */
  usdToBrl: number;
  /** Quantos reais vale 1 yuan/RMB (CNY→BRL). */
  cnyToBrl: number;
  /** Timestamp (ms epoch UTC) de quando a cotação foi obtida. */
  fetchedAt: number;
  /** Origem da cotação. */
  source: "awesomeapi" | "cache" | "fallback";
}

let cache: { rate: FxRate; expiresAt: number } | null = null;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Extrai uma cotação <PAR>→BRL do payload da AwesomeAPI.
 * `code` é o código da moeda de origem (ex.: "USD", "CNY").
 * Lança em formato inválido.
 */
export function parsePairBrl(payload: unknown, code: string): number {
  if (!payload || typeof payload !== "object") {
    throw new Error("Resposta de câmbio inválida");
  }
  const obj = payload as Record<string, unknown>;
  const key = `${code}BRL`;
  const node = (obj[key] ?? obj[`${code}BRLT`] ?? obj[`${code}-BRL`]) as
    | Record<string, unknown>
    | undefined;
  if (!node) throw new Error(`Par ${key} ausente na resposta de câmbio`);
  const bid = node.bid ?? node.ask ?? node.high;
  const value = typeof bid === "string" ? Number.parseFloat(bid) : Number(bid);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Valor de câmbio inválido");
  }
  return round4(value);
}

/** Compat: parse específico do par USD→BRL (mantido para testes existentes). */
export function parseAwesomeUsdBrl(payload: unknown): number {
  return parsePairBrl(payload, "USD");
}

/**
 * Obtém as cotações USD→BRL e CNY→BRL, usando cache curto e fallback.
 * Nunca lança: em falha total devolve a última conhecida ou os DEFAULTs.
 */
export async function getFxRates(): Promise<FxRate> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return { ...cache.rate, source: "cache" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,CNY-BRL", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Câmbio HTTP ${res.status}`);
    const json = await res.json();
    const usdToBrl = parsePairBrl(json, "USD");
    // CNY pode faltar em alguns retornos; cai no fallback do yuan se necessário.
    let cnyToBrl = DEFAULT_CNY_BRL;
    try {
      cnyToBrl = parsePairBrl(json, "CNY");
    } catch {
      cnyToBrl = cache?.rate.cnyToBrl ?? DEFAULT_CNY_BRL;
    }
    const rate: FxRate = { usdToBrl, cnyToBrl, fetchedAt: now, source: "awesomeapi" };
    cache = { rate, expiresAt: now + CACHE_TTL_MS };
    return rate;
  } catch {
    if (cache) {
      return { ...cache.rate, source: "fallback" };
    }
    return {
      usdToBrl: DEFAULT_USD_BRL,
      cnyToBrl: DEFAULT_CNY_BRL,
      fetchedAt: now,
      source: "fallback",
    };
  }
}

/** Compat: mantém a assinatura antiga usada pelo router. */
export async function getUsdBrlRate(): Promise<FxRate> {
  return getFxRates();
}
