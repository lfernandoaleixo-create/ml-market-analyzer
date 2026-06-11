export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Compact BRL for chart axes/labels, e.g. "R$ 1,2 mil". */
export function formatBRLCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, withSign = true): string {
  if (value == null) return "—";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function reputationLabel(level: string): string {
  const map: Record<string, string> = {
    "5_green": "Verde (excelente)",
    "4_light_green": "Verde-claro (boa)",
    "3_yellow": "Amarelo (regular)",
    "2_orange": "Laranja (atenção)",
    "1_red": "Vermelho (ruim)",
  };
  return map[level] ?? level;
}

export function reputationColor(level: string): string {
  const map: Record<string, string> = {
    "5_green": "bg-emerald-500",
    "4_light_green": "bg-green-400",
    "3_yellow": "bg-yellow-400",
    "2_orange": "bg-orange-400",
    "1_red": "bg-red-500",
  };
  return map[level] ?? "bg-muted";
}

export function powerSellerLabel(status: string | null): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    silver: "MercadoLíder Prata",
    gold: "MercadoLíder Ouro",
    platinum: "MercadoLíder Platinum",
  };
  return map[status] ?? status;
}

export function verdictMeta(verdict: "alto" | "medio" | "baixo") {
  switch (verdict) {
    case "alto":
      return { label: "Alto potencial", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
    case "medio":
      return { label: "Potencial médio", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
    default:
      return { label: "Baixo potencial", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-muted-foreground";
}

/** Percentage from a 0..1 fraction (e.g. conversion). Returns em dash when null. */
export function formatRatePct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Map an ISO date (yyyy-mm-dd) to a short pt-BR label. */
export function isoDateToShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

/** Parse an ISO date (yyyy-mm-dd) into a UTC Date (avoids TZ drift). */
function isoToUtcDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Short weekday label for an ISO date, e.g. "seg", "ter" (pt-BR, UTC). */
export function isoToWeekdayShort(iso: string): string {
  const dt = isoToUtcDate(iso);
  if (!dt) return "";
  return dt
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
}

/** Day-of-month number for an ISO date, e.g. "10" (UTC). */
export function isoToDayNum(iso: string): string {
  const dt = isoToUtcDate(iso);
  if (!dt) return "";
  return String(dt.getUTCDate());
}

/** Long weekday + date label, e.g. "Segunda-feira, 10/06" (pt-BR, UTC). */
export function isoToWeekdayLong(iso: string): string {
  const dt = isoToUtcDate(iso);
  if (!dt) return iso;
  const weekday = dt.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  const date = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date}`;
}
